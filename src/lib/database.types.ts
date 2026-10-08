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
          id: number
          instagram_username: string
          last_checked_at: string | null
          name: string
          poll_interval_minutes: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          instagram_username: string
          last_checked_at?: string | null
          name: string
          poll_interval_minutes?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          instagram_username?: string
          last_checked_at?: string | null
          name?: string
          poll_interval_minutes?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          auto_approved: boolean
          club_id: number
          confidence: number | null
          created_at: string
          ends_at: string | null
          event_type: string
          extracted: Json | null
          food_description: string | null
          has_free_food: boolean
          hosted_by: string | null
          id: number
          location: string | null
          model: string | null
          name: string
          open_to_all: boolean | null
          post_id: string
          reason: string | null
          review_notes: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          start_time_known: boolean
          starts_at: string | null
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          auto_approved?: boolean
          club_id: number
          confidence?: number | null
          created_at?: string
          ends_at?: string | null
          event_type?: string
          extracted?: Json | null
          food_description?: string | null
          has_free_food?: boolean
          hosted_by?: string | null
          id?: never
          location?: string | null
          model?: string | null
          name: string
          open_to_all?: boolean | null
          post_id: string
          reason?: string | null
          review_notes?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_time_known?: boolean
          starts_at?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          auto_approved?: boolean
          club_id?: number
          confidence?: number | null
          created_at?: string
          ends_at?: string | null
          event_type?: string
          extracted?: Json | null
          food_description?: string | null
          has_free_food?: boolean
          hosted_by?: string | null
          id?: never
          location?: string | null
          model?: string | null
          name?: string
          open_to_all?: boolean | null
          post_id?: string
          reason?: string | null
          review_notes?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_time_known?: boolean
          starts_at?: string | null
          status?: string
          tags?: string[]
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
          extracted_at: string | null
          extraction: Json | null
          extraction_error: string | null
          extraction_status: string
          fetched_via: string
          id: string
          image_path: string | null
          image_url: string | null
          media_type: string | null
          permalink: string
          posted_at: string
          raw: Json | null
          shortcode: string
          username: string
        }
        Insert: {
          caption?: string
          club_id: number
          created_at?: string
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          fetched_via: string
          id: string
          image_path?: string | null
          image_url?: string | null
          media_type?: string | null
          permalink: string
          posted_at: string
          raw?: Json | null
          shortcode: string
          username: string
        }
        Update: {
          caption?: string
          club_id?: number
          created_at?: string
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          fetched_via?: string
          id?: string
          image_path?: string | null
          image_url?: string | null
          media_type?: string | null
          permalink?: string
          posted_at?: string
          raw?: Json | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
