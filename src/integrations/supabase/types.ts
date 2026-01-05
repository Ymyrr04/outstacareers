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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          job_id: string | null
          page_path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          job_id?: string | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          job_id?: string | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants_prescreen: {
        Row: {
          ai_assessment_details: Json | null
          ai_summary: string | null
          apply_url: string
          availability_setup_score: number | null
          bonus_red_flag_score: number | null
          can_work_40_50: boolean
          created_at: string
          currently_working: boolean
          cv_file_url: string | null
          cv_text: string | null
          email: string
          extracted_skills: string[] | null
          extracted_tools: string[] | null
          file_hash: string | null
          full_name: string
          good_internet: boolean
          has_experience: boolean
          home_office: boolean
          honeypot_field: string | null
          id: string
          internet_speed: string
          ip_hash: string | null
          job_id: string | null
          job_title: string
          laptop_or_pc: boolean
          location: string
          noise_canceling_headset: boolean
          notes: string | null
          phone: string | null
          power_backup: boolean
          ranking_status: string | null
          role_experience_score: number | null
          skills_tools_score: number | null
          start_availability: string
          status: string
          submitted_at: string
          total_score: number | null
          us_timezone_ok: boolean
          vocaroo_link: string | null
          years_of_experience: number | null
        }
        Insert: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url: string
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50: boolean
          created_at?: string
          currently_working: boolean
          cv_file_url?: string | null
          cv_text?: string | null
          email: string
          extracted_skills?: string[] | null
          extracted_tools?: string[] | null
          file_hash?: string | null
          full_name: string
          good_internet: boolean
          has_experience: boolean
          home_office: boolean
          honeypot_field?: string | null
          id?: string
          internet_speed: string
          ip_hash?: string | null
          job_id?: string | null
          job_title: string
          laptop_or_pc: boolean
          location: string
          noise_canceling_headset: boolean
          notes?: string | null
          phone?: string | null
          power_backup: boolean
          ranking_status?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability: string
          status?: string
          submitted_at?: string
          total_score?: number | null
          us_timezone_ok: boolean
          vocaroo_link?: string | null
          years_of_experience?: number | null
        }
        Update: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url?: string
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50?: boolean
          created_at?: string
          currently_working?: boolean
          cv_file_url?: string | null
          cv_text?: string | null
          email?: string
          extracted_skills?: string[] | null
          extracted_tools?: string[] | null
          file_hash?: string | null
          full_name?: string
          good_internet?: boolean
          has_experience?: boolean
          home_office?: boolean
          honeypot_field?: string | null
          id?: string
          internet_speed?: string
          ip_hash?: string | null
          job_id?: string | null
          job_title?: string
          laptop_or_pc?: boolean
          location?: string
          noise_canceling_headset?: boolean
          notes?: string | null
          phone?: string | null
          power_backup?: boolean
          ranking_status?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability?: string
          status?: string
          submitted_at?: string
          total_score?: number | null
          us_timezone_ok?: boolean
          vocaroo_link?: string | null
          years_of_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "applicants_prescreen_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          applicant_id: string
          applicant_status_at_send: string | null
          body_html: string
          created_at: string
          error_message: string | null
          id: string
          is_automated: boolean
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          applicant_id: string
          applicant_status_at_send?: string | null
          body_html: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_automated?: boolean
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          applicant_id?: string
          applicant_status_at_send?: string | null
          body_html?: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_automated?: boolean
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_replies: {
        Row: {
          applicant_id: string
          body_html: string | null
          body_text: string | null
          created_at: string
          from_email: string
          gmail_message_id: string
          id: string
          in_reply_to: string | null
          received_at: string
          subject: string
        }
        Insert: {
          applicant_id: string
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email: string
          gmail_message_id: string
          id?: string
          in_reply_to?: string | null
          received_at: string
          subject: string
        }
        Update: {
          applicant_id?: string
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email?: string
          gmail_message_id?: string
          id?: string
          in_reply_to?: string | null
          received_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_replies_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          delay_hours: number | null
          id: string
          is_enabled: boolean
          status_trigger: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          delay_hours?: number | null
          id?: string
          is_enabled?: boolean
          status_trigger: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          delay_hours?: number | null
          id?: string
          is_enabled?: boolean
          status_trigger?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          apply_url: string
          created_at: string
          department: string | null
          description: string | null
          id: string
          is_active: boolean | null
          qualifications: string[] | null
          rate: string | null
          region: string | null
          responsibilities: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          apply_url: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          qualifications?: string[] | null
          rate?: string | null
          region?: string | null
          responsibilities?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          qualifications?: string[] | null
          rate?: string | null
          region?: string | null
          responsibilities?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          applicant_id: string
          body_html: string
          canceled_at: string | null
          canceled_by: string | null
          created_at: string
          id: string
          recipient_email: string
          scheduled_for: string
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          applicant_id: string
          body_html: string
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          id?: string
          recipient_email: string
          scheduled_for: string
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          applicant_id?: string
          body_html?: string
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          id?: string
          recipient_email?: string
          scheduled_for?: string
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
