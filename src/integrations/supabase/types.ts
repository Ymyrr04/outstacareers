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
          availability_checked_at: string | null
          availability_setup_score: number | null
          bonus_red_flag_score: number | null
          can_work_40_50: boolean
          candidate_profile: string | null
          created_at: string
          currently_working: boolean
          cv_file_url: string | null
          cv_text: string | null
          details_viewed_at: string | null
          device_type: string | null
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
          is_available: boolean | null
          is_starred: boolean | null
          job_id: string | null
          job_source: string | null
          job_title: string
          laptop_or_pc: boolean
          location: string
          noise_canceling_headset: boolean
          notes: string | null
          original_job_id: string | null
          original_job_title: string | null
          phone: string | null
          power_backup: boolean
          ranking_status: string | null
          reprofiled_at: string | null
          role_experience_score: number | null
          skills_tools_score: number | null
          start_availability: string
          status: string
          submitted_at: string
          total_score: number | null
          us_timezone_ok: boolean
          vocaroo_link: string | null
          voice_recording_url: string | null
          whatsapp: string | null
          years_of_experience: number | null
        }
        Insert: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url: string
          availability_checked_at?: string | null
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50: boolean
          candidate_profile?: string | null
          created_at?: string
          currently_working: boolean
          cv_file_url?: string | null
          cv_text?: string | null
          details_viewed_at?: string | null
          device_type?: string | null
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
          is_available?: boolean | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title: string
          laptop_or_pc: boolean
          location: string
          noise_canceling_headset: boolean
          notes?: string | null
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup: boolean
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability: string
          status?: string
          submitted_at?: string
          total_score?: number | null
          us_timezone_ok: boolean
          vocaroo_link?: string | null
          voice_recording_url?: string | null
          whatsapp?: string | null
          years_of_experience?: number | null
        }
        Update: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url?: string
          availability_checked_at?: string | null
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50?: boolean
          candidate_profile?: string | null
          created_at?: string
          currently_working?: boolean
          cv_file_url?: string | null
          cv_text?: string | null
          details_viewed_at?: string | null
          device_type?: string | null
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
          is_available?: boolean | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title?: string
          laptop_or_pc?: boolean
          location?: string
          noise_canceling_headset?: boolean
          notes?: string | null
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup?: boolean
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability?: string
          status?: string
          submitted_at?: string
          total_score?: number | null
          us_timezone_ok?: boolean
          vocaroo_link?: string | null
          voice_recording_url?: string | null
          whatsapp?: string | null
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
      availability_responses: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          responded_at: string | null
          response: string
          response_token: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          responded_at?: string | null
          response: string
          response_token: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          responded_at?: string | null
          response?: string
          response_token?: string
        }
        Relationships: []
      }
      client_communications: {
        Row: {
          client_id: string
          communication_date: string
          communication_type: string
          contact_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          subject: string | null
        }
        Insert: {
          client_id: string
          communication_date?: string
          communication_type: string
          contact_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
        }
        Update: {
          client_id?: string
          communication_date?: string
          communication_type?: string
          contact_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_communications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_communications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean | null
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_status: string | null
          company_name: string
          created_at: string
          id: string
          industry: string | null
          notes: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          billing_status?: string | null
          company_name: string
          created_at?: string
          id?: string
          industry?: string | null
          notes?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          billing_status?: string | null
          company_name?: string
          created_at?: string
          id?: string
          industry?: string | null
          notes?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contractor_assignments: {
        Row: {
          applicant_id: string
          client_id: string
          created_at: string
          end_date: string | null
          hourly_rate: number | null
          id: string
          job_title: string | null
          notes: string | null
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          applicant_id: string
          client_id: string
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          job_title?: string | null
          notes?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          client_id?: string
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          job_title?: string | null
          notes?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_assignments_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          is_read: boolean
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
          is_read?: boolean
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
          is_read?: boolean
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
          name: string | null
          status_trigger: string
          subject: string
          template_order: number | null
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          delay_hours?: number | null
          id?: string
          is_enabled?: boolean
          name?: string | null
          status_trigger: string
          subject: string
          template_order?: number | null
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          delay_hours?: number | null
          id?: string
          is_enabled?: boolean
          name?: string | null
          status_trigger?: string
          subject?: string
          template_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      interview_answers: {
        Row: {
          ai_feedback: string | null
          ai_score: number | null
          answered_at: string
          created_at: string
          id: string
          question_id: string
          selected_option_id: string | null
          session_id: string
          text_answer: string | null
          voice_duration_seconds: number | null
          voice_recording_url: string | null
        }
        Insert: {
          ai_feedback?: string | null
          ai_score?: number | null
          answered_at?: string
          created_at?: string
          id?: string
          question_id: string
          selected_option_id?: string | null
          session_id: string
          text_answer?: string | null
          voice_duration_seconds?: number | null
          voice_recording_url?: string | null
        }
        Update: {
          ai_feedback?: string | null
          ai_score?: number | null
          answered_at?: string
          created_at?: string
          id?: string
          question_id?: string
          selected_option_id?: string | null
          session_id?: string
          text_answer?: string | null
          voice_duration_seconds?: number | null
          voice_recording_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          created_at: string
          id: string
          options: Json | null
          question_context: string | null
          question_order: number
          question_text: string
          section: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json | null
          question_context?: string | null
          question_order: number
          question_text: string
          section: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json | null
          question_context?: string | null
          question_order?: number
          question_text?: string
          section?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          admin_notified_at: string | null
          ai_assessment_details: Json | null
          ai_concerns: string[] | null
          ai_strengths: string[] | null
          ai_summary: string | null
          applicant_id: string
          communication_score: number | null
          completed_at: string | null
          created_at: string
          experience_score: number | null
          id: string
          job_id: string | null
          overall_score: number | null
          personality_score: number | null
          reminder_sent_at: string | null
          situational_score: number | null
          started_at: string
          status: string
          technical_score: number | null
          updated_at: string
        }
        Insert: {
          admin_notified_at?: string | null
          ai_assessment_details?: Json | null
          ai_concerns?: string[] | null
          ai_strengths?: string[] | null
          ai_summary?: string | null
          applicant_id: string
          communication_score?: number | null
          completed_at?: string | null
          created_at?: string
          experience_score?: number | null
          id?: string
          job_id?: string | null
          overall_score?: number | null
          personality_score?: number | null
          reminder_sent_at?: string | null
          situational_score?: number | null
          started_at?: string
          status?: string
          technical_score?: number | null
          updated_at?: string
        }
        Update: {
          admin_notified_at?: string | null
          ai_assessment_details?: Json | null
          ai_concerns?: string[] | null
          ai_strengths?: string[] | null
          ai_summary?: string | null
          applicant_id?: string
          communication_score?: number | null
          completed_at?: string | null
          created_at?: string
          experience_score?: number | null
          id?: string
          job_id?: string | null
          overall_score?: number | null
          personality_score?: number | null
          reminder_sent_at?: string | null
          situational_score?: number | null
          started_at?: string
          status?: string
          technical_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_interview_questions: {
        Row: {
          created_at: string
          id: string
          job_id: string
          question_context: string | null
          question_order: number
          question_text: string
          question_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          question_context?: string | null
          question_order?: number
          question_text: string
          question_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          question_context?: string | null
          question_order?: number
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_interview_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string | null
          assigned_admin_id: string | null
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
          apply_url?: string | null
          assigned_admin_id?: string | null
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
          apply_url?: string | null
          assigned_admin_id?: string | null
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
      applicant_exists: { Args: { _applicant_id: string }; Returns: boolean }
      has_active_interview_session: {
        Args: { _applicant_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
      app_role: ["admin", "user", "super_admin"],
    },
  },
} as const
