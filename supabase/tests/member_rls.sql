-- Row level security checks for member accounts. Run it in the SQL editor (or execute_sql)
-- as the postgres role. Everything happens inside one DO block that always ends by raising an
-- exception, so every row it makes is rolled back, whatever happens: nothing is left behind,
-- and no member numbers are used (the two test accounts are never confirmed).
--
-- Passing ends with:  ERROR: PASS: every member RLS check held
-- A failure ends with: ERROR: FAIL: <what went wrong>

do $$
declare
  a uuid := 'a0000000-0000-4000-8000-00000000000a';
  b uuid := 'b0000000-0000-4000-8000-00000000000b';
  b_token uuid;
  club bigint;
  other_club bigint;
  ev bigint;
  n bigint;
begin
  select id into club from public.clubs order by id limit 1;
  select id into other_club from public.clubs order by id offset 1 limit 1;
  select id into ev from public.events where status = 'approved' order by id limit 1;
  if club is null or other_club is null or ev is null then
    raise exception 'FAIL: needs two clubs and an approved event to test with';
  end if;

  -- Two members, A and B, each with one row in every member table.
  insert into auth.users (id, email, aud, role)
  values (a, 'rls-test-a@example.invalid', 'authenticated', 'authenticated'),
         (b, 'rls-test-b@example.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (id) values (a), (b);
  select email_token into b_token from public.profiles where id = b;
  insert into public.user_interests (user_id, interest) values (a, 'social'), (b, 'arts');
  insert into public.club_follows (user_id, club_id) values (a, club), (b, club);
  insert into public.busy_blocks (user_id, weekday, start_minute, end_minute, term_ends_on, source)
  values (a, 1, 600, 660, current_date + 30, 'grid'), (b, 2, 600, 660, current_date + 30, 'grid');
  insert into public.event_reminders (user_id, event_id) values (a, ev), (b, ev);
  perform private.record_email_choice(a, 'digest', true, 'settings', 'test');

  -- ── As member B ──────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- B can't read A's rows...
  if (select count(*) from public.profiles where id = a) <> 0 then raise exception 'FAIL: B can read A''s profile'; end if;
  if (select count(*) from public.user_interests where user_id = a) <> 0 then raise exception 'FAIL: B can read A''s interests'; end if;
  if (select count(*) from public.club_follows where user_id = a) <> 0 then raise exception 'FAIL: B can read A''s follows'; end if;
  if (select count(*) from public.busy_blocks where user_id = a) <> 0 then raise exception 'FAIL: B can read A''s busy blocks'; end if;
  if (select count(*) from public.event_reminders where user_id = a) <> 0 then raise exception 'FAIL: B can read A''s reminders'; end if;
  if (select count(*) from public.email_consents where user_id = a) <> 0 then raise exception 'FAIL: B can read A''s consents'; end if;
  if (select count(*) from public.email_sends) <> 0 then raise exception 'FAIL: B can read email sends'; end if;
  -- ...but can read their own.
  if (select count(*) from public.profiles where id = b) <> 1 then raise exception 'FAIL: B can''t read their own profile'; end if;
  if (select count(*) from public.user_interests where user_id = b) <> 1 then raise exception 'FAIL: B can''t read their own interests'; end if;
  if (select count(*) from public.club_follows where user_id = b) <> 1 then raise exception 'FAIL: B can''t read their own follows'; end if;
  if (select count(*) from public.busy_blocks where user_id = b) <> 1 then raise exception 'FAIL: B can''t read their own busy blocks'; end if;

  -- B can't add rows for A.
  begin
    insert into public.user_interests (user_id, interest) values (a, 'sports');
    raise exception 'FAIL: B added an interest for A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.club_follows (user_id, club_id) values (a, other_club);
    raise exception 'FAIL: B added a follow for A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.busy_blocks (user_id, weekday, start_minute, end_minute, term_ends_on, source)
    values (a, 3, 600, 660, current_date + 30, 'grid');
    raise exception 'FAIL: B added a busy block for A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.member_days (user_id, day) values (a, current_date);
    raise exception 'FAIL: B logged a day for A';
  exception when insufficient_privilege then null;
  end;

  -- B can't change or delete A's rows (they're invisible, so nothing matches).
  delete from public.user_interests where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s interests'; end if;
  delete from public.club_follows where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s follows'; end if;
  delete from public.busy_blocks where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s busy blocks'; end if;
  update public.profiles set display_name = 'hacked' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B renamed A'; end if;

  -- B can't give themselves a founding number or flip an email on without the consent log.
  begin
    update public.profiles set member_number = 1, founding_member = true where id = b;
    raise exception 'FAIL: B changed their member number';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set email_digest = true where id = b;
    raise exception 'FAIL: B turned an email on without the consent log';
  exception when insufficient_privilege then null;
  end;

  -- Admin and email-job functions are closed to members.
  begin
    perform public.email_recipients();
    raise exception 'FAIL: B can list email recipients';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.member_totals();
    raise exception 'FAIL: B can read member totals';
  exception when raise_exception then
    if sqlerrm not like 'admins only%' then raise; end if;
  end;

  -- Email choices: only the allowed ways, and each one logged.
  begin
    perform public.set_email_choice('digest', false, 'unsubscribe_link');
    raise exception 'FAIL: B used a link-only way from their account';
  exception when raise_exception then
    if sqlerrm not like 'not allowed%' then raise; end if;
  end;
  perform public.set_email_choice('digest', true, 'settings', 'test wording');
  if not (select email_digest from public.profiles where id = b) then raise exception 'FAIL: set_email_choice didn''t turn the digest on'; end if;
  if (select count(*) from public.email_consents where user_id = b and type = 'digest' and withdrawn_at is null) <> 1 then
    raise exception 'FAIL: turning the digest on wasn''t logged once';
  end if;

  -- ── Signed out ───────────────────────────────────────────────────────────────────────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL: anon can read profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.user_interests limit 1;
    raise exception 'FAIL: anon can read interests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.club_follows limit 1;
    raise exception 'FAIL: anon can read follows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.busy_blocks limit 1;
    raise exception 'FAIL: anon can read busy blocks';
  exception when insufficient_privilege then null;
  end;

  -- Unsubscribe works signed out with the link's token, and only with it.
  if public.unsubscribe(gen_random_uuid(), 'all', 'unsubscribe_link') then raise exception 'FAIL: an unknown token unsubscribed someone'; end if;
  if not public.unsubscribe(b_token, 'all', 'list_unsubscribe') then raise exception 'FAIL: B''s token didn''t unsubscribe'; end if;

  reset role;
  if (select email_digest or email_club_posts or email_reminders from public.profiles where id = b) then
    raise exception 'FAIL: unsubscribe left an email on';
  end if;
  if (select count(*) from public.email_consents where user_id = b and withdrawn_at is null) <> 0 then
    raise exception 'FAIL: unsubscribe didn''t log the withdrawal';
  end if;
  if not (select email_digest from public.profiles where id = a) then raise exception 'FAIL: B''s unsubscribe touched A'; end if;

  raise exception 'PASS: every member RLS check held';
end $$;
