// Generated from the Supabase schema (project mac-cushion-calendar).
// Regenerate after migrations rather than editing by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clubs: {
        Row: {
          active: boolean
          created_at: string
          followers: number | null
          followers_at: string | null
          id: number
          instagram_username: string
          last_checked_at: string | null
          name: string
          poll_interval_minutes: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          followers?: number | null
          followers_at?: string | null
          id?: never
          instagram_username: string
          last_checked_at?: string | null
          name: string
          poll_interval_minutes?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          followers?: number | null
          followers_at?: string | null
          id?: never
          instagram_username?: string
          last_checked_at?: string | null
          name?: string
          poll_interval_minutes?: number
        }
        Relationships: []
      }
      event_matches: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          event_id: number
          reasons: Json
          rubric_eid: number
          score: number
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          event_id: number
          reasons?: Json
          rubric_eid: number
          score: number
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          event_id?: number
          reasons?: Json
          rubric_eid?: number
          score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_matches_rubric_eid_fkey"
            columns: ["rubric_eid"]
            isOneToOne: false
            referencedRelation: "rubric_events"
            referencedColumns: ["eid"]
          },
        ]
      }
      events: {
        Row: {
          auto_approved: boolean
          category: string
          club_id: number
          confidence: number | null
          conflicts: Json
          cost: string
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string
          extracted: Json | null
          flags: string[]
          food_description: string | null
          food_source: string | null
          has_free_food: boolean
          hosted_by: string | null
          id: number
          image_url: string | null
          location: string | null
          off_campus: boolean
          model: string | null
          name: string
          open_to_all: boolean | null
          post_id: string | null
          price: string | null
          reason: string | null
          review_notes: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_fields: string[]
          rubric_eid: number | null
          signup_required: boolean | null
          source: string
          start_time_known: boolean
          starts_at: string | null
          status: string
          tags: string[]
          ticket_url: string | null
          updated_at: string
        }
        Insert: {
          auto_approved?: boolean
          category?: string
          club_id: number
          confidence?: number | null
          conflicts?: Json
          cost?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          extracted?: Json | null
          flags?: string[]
          food_description?: string | null
          food_source?: string | null
          has_free_food?: boolean
          hosted_by?: string | null
          id?: never
          image_url?: string | null
          location?: string | null
          off_campus?: boolean
          model?: string | null
          name: string
          open_to_all?: boolean | null
          post_id?: string | null
          price?: string | null
          reason?: string | null
          review_notes?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_fields?: string[]
          rubric_eid?: number | null
          signup_required?: boolean | null
          source?: string
          start_time_known?: boolean
          starts_at?: string | null
          status?: string
          tags?: string[]
          ticket_url?: string | null
          updated_at?: string
        }
        Update: {
          auto_approved?: boolean
          category?: string
          club_id?: number
          confidence?: number | null
          conflicts?: Json
          cost?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          extracted?: Json | null
          flags?: string[]
          food_description?: string | null
          food_source?: string | null
          has_free_food?: boolean
          hosted_by?: string | null
          id?: never
          image_url?: string | null
          location?: string | null
          off_campus?: boolean
          model?: string | null
          name?: string
          open_to_all?: boolean | null
          post_id?: string | null
          price?: string | null
          reason?: string | null
          review_notes?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_fields?: string[]
          rubric_eid?: number | null
          signup_required?: boolean | null
          source?: string
          start_time_known?: boolean
          starts_at?: string | null
          status?: string
          tags?: string[]
          ticket_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_rubric_eid_fkey"
            columns: ["rubric_eid"]
            isOneToOne: true
            referencedRelation: "rubric_events"
            referencedColumns: ["eid"]
          },
        ]
      }
      fetch_logs: {
        Row: {
          attempt: number
          backend: string
          club_id: number | null
          created_at: string
          detail: string | null
          http_status: number | null
          id: number
          outcome: string
          response_bytes: number
          username: string
          via: string | null
        }
        Insert: {
          attempt: number
          backend: string
          club_id?: number | null
          created_at?: string
          detail?: string | null
          http_status?: number | null
          id?: never
          outcome: string
          response_bytes?: number
          username: string
          via?: string | null
        }
        Update: {
          attempt?: number
          backend?: string
          club_id?: number | null
          created_at?: string
          detail?: string | null
          http_status?: number | null
          id?: never
          outcome?: string
          response_bytes?: number
          username?: string
          via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fetch_logs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          cost_usd: number | null
          created_at: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          post_id: string | null
          purpose: string | null
          stop_reason: string | null
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd?: number | null
          created_at?: string
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          post_id?: string | null
          purpose?: string | null
          stop_reason?: string | null
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd?: number | null
          created_at?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          post_id?: string | null
          purpose?: string | null
          stop_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claude_usage_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string
          club_id: number
          created_at: string
          deleted_at: string | null
          extracted_at: string | null
          extraction: Json | null
          extraction_error: string | null
          extraction_status: string
          fetched_via: string
          first_pass: Json | null
          id: string
          image_path: string | null
          image_url: string | null
          media_type: string | null
          permalink: string
          posted_at: string
          raw: Json | null
          read_batch: string | null
          shortcode: string
          username: string
        }
        Insert: {
          caption?: string
          club_id: number
          created_at?: string
          deleted_at?: string | null
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          fetched_via: string
          first_pass?: Json | null
          id: string
          image_path?: string | null
          image_url?: string | null
          media_type?: string | null
          permalink: string
          posted_at: string
          raw?: Json | null
          read_batch?: string | null
          shortcode: string
          username: string
        }
        Update: {
          caption?: string
          club_id?: number
          created_at?: string
          deleted_at?: string | null
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          fetched_via?: string
          first_pass?: Json | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          media_type?: string | null
          permalink?: string
          posted_at?: string
          raw?: Json | null
          read_batch?: string | null
          shortcode?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_events: {
        Row: {
          address: string | null
          category: string | null
          changed_at: string
          collaborator_ids: number[]
          content_hash: string
          description: string | null
          detail: Json | null
          detail_fetched_at: string | null
          eid: number
          ends_at: string | null
          first_seen_at: string
          image_url: string | null
          last_seen_at: string
          location: string | null
          missing_since: string | null
          price_info: string | null
          rubric_status: string | null
          search: Json
          society_id: number
          starts_at: string
          tickets: Json
          title: string
          url: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          changed_at?: string
          collaborator_ids?: number[]
          content_hash: string
          description?: string | null
          detail?: Json | null
          detail_fetched_at?: string | null
          eid: number
          ends_at?: string | null
          first_seen_at?: string
          image_url?: string | null
          last_seen_at?: string
          location?: string | null
          missing_since?: string | null
          price_info?: string | null
          rubric_status?: string | null
          search: Json
          society_id: number
          starts_at: string
          tickets?: Json
          title: string
          url: string
        }
        Update: {
          address?: string | null
          category?: string | null
          changed_at?: string
          collaborator_ids?: number[]
          content_hash?: string
          description?: string | null
          detail?: Json | null
          detail_fetched_at?: string | null
          eid?: number
          ends_at?: string | null
          first_seen_at?: string
          image_url?: string | null
          last_seen_at?: string
          location?: string | null
          missing_since?: string | null
          price_info?: string | null
          rubric_status?: string | null
          search?: Json
          society_id?: number
          starts_at?: string
          tickets?: Json
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "rubric_societies"
            referencedColumns: ["society_id"]
          },
        ]
      }
      rubric_societies: {
        Row: {
          aliases: string[]
          club_id: number | null
          extra_club_ids: number[]
          first_seen_at: string
          instagram_username: string | null
          match_method: string | null
          match_score: number | null
          match_status: string
          name: string
          raw: Json | null
          society_id: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          club_id?: number | null
          extra_club_ids?: number[]
          first_seen_at?: string
          instagram_username?: string | null
          match_method?: string | null
          match_score?: number | null
          match_status?: string
          name: string
          raw?: Json | null
          society_id: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          club_id?: number | null
          extra_club_ids?: number[]
          first_seen_at?: string
          instagram_username?: string | null
          match_method?: string | null
          match_score?: number | null
          match_status?: string
          name?: string
          raw?: Json | null
          society_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_societies_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          consent: string
          created_at: string
          email: string
          id: number
          newsletter: boolean
          newsletter_consent_at: string | null
          source: string | null
        }
        Insert: {
          consent: string
          created_at?: string
          email: string
          id?: never
          newsletter?: boolean
          newsletter_consent_at?: string | null
          source?: string | null
        }
        Update: {
          consent?: string
          created_at?: string
          email?: string
          id?: never
          newsletter?: boolean
          newsletter_consent_at?: string | null
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      join_waitlist: {
        Args: {
          p_consent: string
          p_email: string
          p_newsletter: boolean
          p_source: string
        }
        Returns: boolean
      }
      waitlist_count: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Omit<Database, "__InternalSupabase">["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
