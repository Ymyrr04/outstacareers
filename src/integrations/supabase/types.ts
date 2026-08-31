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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_tab_permissions: {
        Row: {
          can_view: boolean
          created_at: string
          id: string
          tab_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view?: boolean
          created_at?: string
          id?: string
          tab_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view?: boolean
          created_at?: string
          id?: string
          tab_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          context: Json | null
          created_at: string
          error_message: string | null
          function_name: string
          id: string
          model: string | null
          prompt_tokens: number | null
          status: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          status?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          status?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applicant_notes: {
        Row: {
          applicant_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_notes_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_status_history: {
        Row: {
          applicant_id: string
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          applicant_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          applicant_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_status_history_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
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
          employment_status: string | null
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
          interview_invite_sent_at: string | null
          ip_hash: string | null
          is_available: boolean | null
          is_starred: boolean | null
          job_id: string | null
          job_source: string | null
          job_title: string
          laptop_or_pc: boolean
          last_day_with_employer: string | null
          location: string
          noise_canceling_headset: boolean
          notes: string | null
          original_job_id: string | null
          original_job_title: string | null
          phone: string | null
          power_backup: boolean
          pre_archive_status: string | null
          pre_screening_flagged: boolean
          pre_screening_responses: Json | null
          ranking_status: string | null
          reprofiled_at: string | null
          role_experience_score: number | null
          skills_tools_score: number | null
          start_availability: string
          status: string
          submitted_at: string
          suitable_roles: string[]
          tags: string[]
          total_score: number | null
          upcoming_plans: string | null
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
          employment_status?: string | null
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
          interview_invite_sent_at?: string | null
          ip_hash?: string | null
          is_available?: boolean | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title: string
          laptop_or_pc: boolean
          last_day_with_employer?: string | null
          location: string
          noise_canceling_headset: boolean
          notes?: string | null
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup: boolean
          pre_archive_status?: string | null
          pre_screening_flagged?: boolean
          pre_screening_responses?: Json | null
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability: string
          status?: string
          submitted_at?: string
          suitable_roles?: string[]
          tags?: string[]
          total_score?: number | null
          upcoming_plans?: string | null
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
          employment_status?: string | null
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
          interview_invite_sent_at?: string | null
          ip_hash?: string | null
          is_available?: boolean | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title?: string
          laptop_or_pc?: boolean
          last_day_with_employer?: string | null
          location?: string
          noise_canceling_headset?: boolean
          notes?: string | null
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup?: boolean
          pre_archive_status?: string | null
          pre_screening_flagged?: boolean
          pre_screening_responses?: Json | null
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability?: string
          status?: string
          submitted_at?: string
          suitable_roles?: string[]
          tags?: string[]
          total_score?: number | null
          upcoming_plans?: string | null
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
      cached_emails: {
        Row: {
          admin_email: string
          body_html: string | null
          body_text: string | null
          fetched_at: string
          id: string
          internal_date: string | null
          is_archived: boolean
          is_read: boolean
          is_starred: boolean
          label_ids: string[] | null
          recipient_email: string | null
          sender_email: string | null
          sender_name: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          admin_email: string
          body_html?: string | null
          body_text?: string | null
          fetched_at?: string
          id: string
          internal_date?: string | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[] | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          admin_email?: string
          body_html?: string | null
          body_text?: string | null
          fetched_at?: string
          id?: string
          internal_date?: string | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[] | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      calendar_admin_colors: {
        Row: {
          color_index: number
          created_at: string
          user_id: string
        }
        Insert: {
          color_index: number
          created_at?: string
          user_id: string
        }
        Update: {
          color_index?: number
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_comments: {
        Row: {
          comment: string
          commented_by: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          comment: string
          commented_by: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          comment?: string
          commented_by?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          assigned_to: string[]
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          end_time: number
          event_date: string
          event_type: string
          id: string
          is_done: boolean
          is_open_task: boolean
          is_recurring: boolean
          meeting_notes: string | null
          notify_slack: boolean
          pipeline_link: Json | null
          recurrence_rule: string | null
          start_time: number
          time_tbd: boolean
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string[]
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_time: number
          event_date: string
          event_type?: string
          id?: string
          is_done?: boolean
          is_open_task?: boolean
          is_recurring?: boolean
          meeting_notes?: string | null
          notify_slack?: boolean
          pipeline_link?: Json | null
          recurrence_rule?: string | null
          start_time: number
          time_tbd?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string[]
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: number
          event_date?: string
          event_type?: string
          id?: string
          is_done?: boolean
          is_open_task?: boolean
          is_recurring?: boolean
          meeting_notes?: string | null
          notify_slack?: boolean
          pipeline_link?: Json | null
          recurrence_rule?: string | null
          start_time?: number
          time_tbd?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidate_additional_profiles: {
        Row: {
          applicant_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_additional_profiles_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants_prescreen"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_templates_library: {
        Row: {
          body_html: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          sections: Json | null
          subject: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          sections?: Json | null
          subject?: string | null
          template_type?: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sections?: Json | null
          subject?: string | null
          template_type?: string
          updated_at?: string
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
          first_name: string | null
          full_name: string
          id: string
          is_primary: boolean | null
          last_name: string | null
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
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
      client_hiring_requests: {
        Row: {
          assigned_admin_id: string | null
          client_id: string | null
          client_status: string
          closed_at: string | null
          comment_count: number | null
          created_at: string
          hours_per_week: string | null
          id: string
          industry: string | null
          job_title: string
          notes: string | null
          pipeline_stage: string
          priority: string
          source: string | null
          start_date: string | null
          target_end_date: string | null
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          client_id?: string | null
          client_status?: string
          closed_at?: string | null
          comment_count?: number | null
          created_at?: string
          hours_per_week?: string | null
          id?: string
          industry?: string | null
          job_title: string
          notes?: string | null
          pipeline_stage?: string
          priority?: string
          source?: string | null
          start_date?: string | null
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          client_id?: string | null
          client_status?: string
          closed_at?: string | null
          comment_count?: number | null
          created_at?: string
          hours_per_week?: string | null
          id?: string
          industry?: string | null
          job_title?: string
          notes?: string | null
          pipeline_stage?: string
          priority?: string
          source?: string | null
          start_date?: string | null
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_hiring_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_user_contractors: {
        Row: {
          contractor_assignment_id: string
          created_at: string
          id: string
          portal_user_id: string
        }
        Insert: {
          contractor_assignment_id: string
          created_at?: string
          id?: string
          portal_user_id: string
        }
        Update: {
          contractor_assignment_id?: string
          created_at?: string
          id?: string
          portal_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_user_contractors_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_user_contractors_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_first_login: boolean
          label: string | null
          must_change_password: boolean
          password_reset_required: boolean
          phone: string | null
          primary_email: string | null
          secondary_email: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_first_login?: boolean
          label?: string | null
          must_change_password?: boolean
          password_reset_required?: boolean
          phone?: string | null
          primary_email?: string | null
          secondary_email?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_first_login?: boolean
          label?: string | null
          must_change_password?: boolean
          password_reset_required?: boolean
          phone?: string | null
          primary_email?: string | null
          secondary_email?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      client_timesheet_review_events: {
        Row: {
          client_id: string
          created_at: string
          event_type: string
          id: string
          reason: string | null
          reviewer_email: string | null
          reviewer_user_id: string | null
          timesheet_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          event_type: string
          id?: string
          reason?: string | null
          reviewer_email?: string | null
          reviewer_user_id?: string | null
          timesheet_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          reason?: string | null
          reviewer_email?: string | null
          reviewer_user_id?: string | null
          timesheet_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          calendar_notes: Json | null
          company_links: string | null
          company_name: string
          contractor_count: number | null
          created_at: string
          id: string
          industry: string | null
          is_hiring: boolean | null
          leads_from: string | null
          notes: string | null
          updated_at: string
          website: string | null
          yearly_increase: boolean | null
        }
        Insert: {
          address?: string | null
          calendar_notes?: Json | null
          company_links?: string | null
          company_name: string
          contractor_count?: number | null
          created_at?: string
          id?: string
          industry?: string | null
          is_hiring?: boolean | null
          leads_from?: string | null
          notes?: string | null
          updated_at?: string
          website?: string | null
          yearly_increase?: boolean | null
        }
        Update: {
          address?: string | null
          calendar_notes?: Json | null
          company_links?: string | null
          company_name?: string
          contractor_count?: number | null
          created_at?: string
          id?: string
          industry?: string | null
          is_hiring?: boolean | null
          leads_from?: string | null
          notes?: string | null
          updated_at?: string
          website?: string | null
          yearly_increase?: boolean | null
        }
        Relationships: []
      }
      contract_audit_events: {
        Row: {
          actor_email: string | null
          created_at: string
          envelope_id: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          envelope_id: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          envelope_id?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_audit_events_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "contract_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_countersign_message_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_envelope_field_values: {
        Row: {
          envelope_id: string
          filled_at: string
          id: string
          signature_data_url: string | null
          template_field_id: string
          value: string | null
        }
        Insert: {
          envelope_id: string
          filled_at?: string
          id?: string
          signature_data_url?: string | null
          template_field_id: string
          value?: string | null
        }
        Update: {
          envelope_id?: string
          filled_at?: string
          id?: string
          signature_data_url?: string | null
          template_field_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_envelope_field_values_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "contract_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_envelope_field_values_template_field_id_fkey"
            columns: ["template_field_id"]
            isOneToOne: false
            referencedRelation: "contract_template_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_envelopes: {
        Row: {
          admin_prefill: Json
          applicant_id: string | null
          audit_pdf_path: string | null
          contractor_assignment_id: string | null
          countersign_expires_at: string | null
          countersign_message: string | null
          countersign_placement: Json | null
          countersign_recipient_email: string | null
          countersign_recipient_name: string | null
          countersign_sent_at: string | null
          countersign_token: string | null
          countersign_viewed_at: string | null
          countersigned_at: string | null
          countersigned_file_url: string | null
          created_at: string
          expires_at: string
          id: string
          message: string | null
          recipient_email: string
          recipient_name: string
          sender_email: string | null
          sender_user_id: string | null
          sent_at: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signed_pdf_sha256: string | null
          signing_token: string
          status: string
          template_id: string | null
          updated_at: string
          viewed_at: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          admin_prefill?: Json
          applicant_id?: string | null
          audit_pdf_path?: string | null
          contractor_assignment_id?: string | null
          countersign_expires_at?: string | null
          countersign_message?: string | null
          countersign_placement?: Json | null
          countersign_recipient_email?: string | null
          countersign_recipient_name?: string | null
          countersign_sent_at?: string | null
          countersign_token?: string | null
          countersign_viewed_at?: string | null
          countersigned_at?: string | null
          countersigned_file_url?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_email: string
          recipient_name: string
          sender_email?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signed_pdf_sha256?: string | null
          signing_token: string
          status?: string
          template_id?: string | null
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          admin_prefill?: Json
          applicant_id?: string | null
          audit_pdf_path?: string | null
          contractor_assignment_id?: string | null
          countersign_expires_at?: string | null
          countersign_message?: string | null
          countersign_placement?: Json | null
          countersign_recipient_email?: string | null
          countersign_recipient_name?: string | null
          countersign_sent_at?: string | null
          countersign_token?: string | null
          countersign_viewed_at?: string | null
          countersigned_at?: string | null
          countersigned_file_url?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_email?: string
          recipient_name?: string
          sender_email?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signed_pdf_sha256?: string | null
          signing_token?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_envelopes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_message_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_template_fields: {
        Row: {
          assigned_to: string
          created_at: string
          field_key: string | null
          field_type: string
          height_pct: number
          id: string
          label: string | null
          page: number
          required: boolean
          sort_order: number
          template_id: string
          width_pct: number
          x_pct: number
          y_pct: number
        }
        Insert: {
          assigned_to?: string
          created_at?: string
          field_key?: string | null
          field_type: string
          height_pct: number
          id?: string
          label?: string | null
          page?: number
          required?: boolean
          sort_order?: number
          template_id: string
          width_pct: number
          x_pct: number
          y_pct: number
        }
        Update: {
          assigned_to?: string
          created_at?: string
          field_key?: string | null
          field_type?: string
          height_pct?: number
          id?: string
          label?: string | null
          page?: number
          required?: boolean
          sort_order?: number
          template_id?: string
          width_pct?: number
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          page_count: number
          pdf_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          page_count?: number
          pdf_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          page_count?: number
          pdf_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      contractor_assignments: {
        Row: {
          applicant_id: string
          break_duration_minutes: number | null
          break_is_paid: boolean | null
          checkin_reminder_enabled: boolean
          checkin_reminder_time: string | null
          client_id: string
          client_rate: number | null
          contact_number: string | null
          country: string | null
          created_at: string
          emergency_number: string | null
          end_date: string | null
          hired_by: string | null
          hired_from_stage: string | null
          hired_via: string | null
          hourly_rate: number | null
          hours_per_week: number | null
          id: string
          is_replacement: boolean | null
          job_title: string | null
          notes: string | null
          regular_work_shift: string | null
          separation_note: string | null
          source: string | null
          start_date: string | null
          status: string | null
          status_changed_at: string | null
          sunday_hours_excluded: boolean
          timesheet_link: string | null
          timezone: string | null
          updated_at: string
          work_days: string[]
        }
        Insert: {
          applicant_id: string
          break_duration_minutes?: number | null
          break_is_paid?: boolean | null
          checkin_reminder_enabled?: boolean
          checkin_reminder_time?: string | null
          client_id: string
          client_rate?: number | null
          contact_number?: string | null
          country?: string | null
          created_at?: string
          emergency_number?: string | null
          end_date?: string | null
          hired_by?: string | null
          hired_from_stage?: string | null
          hired_via?: string | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          is_replacement?: boolean | null
          job_title?: string | null
          notes?: string | null
          regular_work_shift?: string | null
          separation_note?: string | null
          source?: string | null
          start_date?: string | null
          status?: string | null
          status_changed_at?: string | null
          sunday_hours_excluded?: boolean
          timesheet_link?: string | null
          timezone?: string | null
          updated_at?: string
          work_days?: string[]
        }
        Update: {
          applicant_id?: string
          break_duration_minutes?: number | null
          break_is_paid?: boolean | null
          checkin_reminder_enabled?: boolean
          checkin_reminder_time?: string | null
          client_id?: string
          client_rate?: number | null
          contact_number?: string | null
          country?: string | null
          created_at?: string
          emergency_number?: string | null
          end_date?: string | null
          hired_by?: string | null
          hired_from_stage?: string | null
          hired_via?: string | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          is_replacement?: boolean | null
          job_title?: string | null
          notes?: string | null
          regular_work_shift?: string | null
          separation_note?: string | null
          source?: string | null
          start_date?: string | null
          status?: string | null
          status_changed_at?: string | null
          sunday_hours_excluded?: boolean
          timesheet_link?: string | null
          timezone?: string | null
          updated_at?: string
          work_days?: string[]
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
      contractor_checkin_emails: {
        Row: {
          body_html: string
          contractor_assignment_id: string
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          stage_id: string
          status: string
          subject: string
        }
        Insert: {
          body_html: string
          contractor_assignment_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          stage_id: string
          status?: string
          subject: string
        }
        Update: {
          body_html?: string
          contractor_assignment_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          stage_id?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_checkin_emails_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_checkin_emails_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "contractor_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_checkin_messages: {
        Row: {
          body_html: string | null
          contractor_assignment_id: string
          created_at: string
          id: string
          read_at: string | null
          responses: Json | null
          sections: Json | null
          sent_by: string | null
          stage_id: string | null
          subject: string
          submitted_at: string | null
          template_type: string
        }
        Insert: {
          body_html?: string | null
          contractor_assignment_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          responses?: Json | null
          sections?: Json | null
          sent_by?: string | null
          stage_id?: string | null
          subject: string
          submitted_at?: string | null
          template_type?: string
        }
        Update: {
          body_html?: string | null
          contractor_assignment_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          responses?: Json | null
          sections?: Json | null
          sent_by?: string | null
          stage_id?: string | null
          subject?: string
          submitted_at?: string | null
          template_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_checkin_messages_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_checkin_messages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "contractor_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_checkin_templates: {
        Row: {
          contractor_assignment_id: string
          created_at: string
          id: string
          sections: Json
          updated_at: string
        }
        Insert: {
          contractor_assignment_id: string
          created_at?: string
          id?: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          contractor_assignment_id?: string
          created_at?: string
          id?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      contractor_daily_checkins: {
        Row: {
          additional_notes: string | null
          checkin_date: string
          contractor_assignment_id: string
          created_at: string
          email_error: string | null
          email_status: string | null
          id: string
          sections: Json
        }
        Insert: {
          additional_notes?: string | null
          checkin_date?: string
          contractor_assignment_id: string
          created_at?: string
          email_error?: string | null
          email_status?: string | null
          id?: string
          sections?: Json
        }
        Update: {
          additional_notes?: string | null
          checkin_date?: string
          contractor_assignment_id?: string
          created_at?: string
          email_error?: string | null
          email_status?: string | null
          id?: string
          sections?: Json
        }
        Relationships: []
      }
      contractor_email_logs: {
        Row: {
          body_html: string
          contractor_assignment_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          recipient_email: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body_html: string
          contractor_assignment_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          recipient_email: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_html?: string
          contractor_assignment_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          recipient_email?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_email_logs_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_email_templates: {
        Row: {
          body_html: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          subject: string
          template_order: number
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          subject: string
          template_order?: number
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          subject?: string
          template_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contractor_import_logs: {
        Row: {
          created_at: string
          error_count: number
          id: string
          imported_by: string | null
          notes: string | null
          source_filename: string | null
          success_count: number
          total_records: number
        }
        Insert: {
          created_at?: string
          error_count?: number
          id?: string
          imported_by?: string | null
          notes?: string | null
          source_filename?: string | null
          success_count?: number
          total_records?: number
        }
        Update: {
          created_at?: string
          error_count?: number
          id?: string
          imported_by?: string | null
          notes?: string | null
          source_filename?: string | null
          success_count?: number
          total_records?: number
        }
        Relationships: []
      }
      contractor_leave_applications: {
        Row: {
          client_informed_approved: boolean
          compensation_note: string | null
          compensation_type: string | null
          contractor_assignment_id: string
          created_at: string
          id: string
          leave_date: string
          leave_type: string
          leave_type_other: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specific_time: string | null
          status: string
          time_period: string
          updated_at: string
        }
        Insert: {
          client_informed_approved?: boolean
          compensation_note?: string | null
          compensation_type?: string | null
          contractor_assignment_id: string
          created_at?: string
          id?: string
          leave_date: string
          leave_type: string
          leave_type_other?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specific_time?: string | null
          status?: string
          time_period: string
          updated_at?: string
        }
        Update: {
          client_informed_approved?: boolean
          compensation_note?: string | null
          compensation_type?: string | null
          contractor_assignment_id?: string
          created_at?: string
          id?: string
          leave_date?: string
          leave_type?: string
          leave_type_other?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specific_time?: string | null
          status?: string
          time_period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_leave_applications_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_legal_doc_requests: {
        Row: {
          admin_notes: string | null
          contractor_assignment_id: string
          created_at: string
          doc_types: string[]
          id: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          contractor_assignment_id: string
          created_at?: string
          doc_types?: string[]
          id?: string
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          contractor_assignment_id?: string
          created_at?: string
          doc_types?: string[]
          id?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_legal_doc_requests_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_pipeline_stages: {
        Row: {
          checkin_email_body: string | null
          checkin_email_subject: string | null
          checkin_sections: Json | null
          contractor_email_body: string | null
          contractor_email_subject: string | null
          created_at: string
          email_recipient: string
          emoji: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          stage_order: number
          trigger_days: number
          updated_at: string
        }
        Insert: {
          checkin_email_body?: string | null
          checkin_email_subject?: string | null
          checkin_sections?: Json | null
          contractor_email_body?: string | null
          contractor_email_subject?: string | null
          created_at?: string
          email_recipient?: string
          emoji?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          stage_order?: number
          trigger_days?: number
          updated_at?: string
        }
        Update: {
          checkin_email_body?: string | null
          checkin_email_subject?: string | null
          checkin_sections?: Json | null
          contractor_email_body?: string | null
          contractor_email_subject?: string | null
          created_at?: string
          email_recipient?: string
          emoji?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          stage_order?: number
          trigger_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      contractor_pipeline_tracking: {
        Row: {
          auto_moved: boolean
          contractor_assignment_id: string
          created_at: string
          current_stage_id: string
          id: string
          moved_at: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          auto_moved?: boolean
          contractor_assignment_id: string
          created_at?: string
          current_stage_id: string
          id?: string
          moved_at?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          auto_moved?: boolean
          contractor_assignment_id?: string
          created_at?: string
          current_stage_id?: string
          id?: string
          moved_at?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_pipeline_tracking_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: true
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_pipeline_tracking_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "contractor_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_portal_users: {
        Row: {
          contractor_assignment_id: string
          created_at: string
          email: string
          id: string
          must_change_password: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          contractor_assignment_id: string
          created_at?: string
          email: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          contractor_assignment_id?: string
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contractor_timesheets: {
        Row: {
          client_approval_status: string
          client_flag_reason: string | null
          client_reviewed_at: string | null
          client_reviewed_by: string | null
          contractor_assignment_id: string
          created_at: string
          daily_hours: Json | null
          id: string
          incentive_amount: number
          locked: boolean
          notes: string | null
          outsta_status: string
          overtime_hours: number
          status: string
          submitted_at: string
          total_hours: number
          updated_at: string
          week_ending_date: string
        }
        Insert: {
          client_approval_status?: string
          client_flag_reason?: string | null
          client_reviewed_at?: string | null
          client_reviewed_by?: string | null
          contractor_assignment_id: string
          created_at?: string
          daily_hours?: Json | null
          id?: string
          incentive_amount?: number
          locked?: boolean
          notes?: string | null
          outsta_status?: string
          overtime_hours?: number
          status?: string
          submitted_at?: string
          total_hours: number
          updated_at?: string
          week_ending_date: string
        }
        Update: {
          client_approval_status?: string
          client_flag_reason?: string | null
          client_reviewed_at?: string | null
          client_reviewed_by?: string | null
          contractor_assignment_id?: string
          created_at?: string
          daily_hours?: Json | null
          id?: string
          incentive_amount?: number
          locked?: boolean
          notes?: string | null
          outsta_status?: string
          overtime_hours?: number
          status?: string
          submitted_at?: string
          total_hours?: number
          updated_at?: string
          week_ending_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_timesheets_contractor_assignment_id_fkey"
            columns: ["contractor_assignment_id"]
            isOneToOne: false
            referencedRelation: "contractor_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_applicants: {
        Row: {
          ai_assessment_details: Json | null
          ai_summary: string | null
          apply_url: string | null
          availability_setup_score: number | null
          bonus_red_flag_score: number | null
          can_work_40_50: boolean | null
          candidate_profile: string | null
          created_at: string | null
          currently_working: boolean | null
          cv_file_url: string | null
          cv_text: string | null
          deleted_at: string
          deleted_by: string | null
          device_type: string | null
          email: string
          extracted_skills: string[] | null
          extracted_tools: string[] | null
          full_name: string
          good_internet: boolean | null
          has_experience: boolean | null
          home_office: boolean | null
          id: string
          internet_speed: string | null
          is_starred: boolean | null
          job_id: string | null
          job_source: string | null
          job_title: string | null
          laptop_or_pc: boolean | null
          location: string | null
          noise_canceling_headset: boolean | null
          notes: string | null
          original_id: string
          original_job_id: string | null
          original_job_title: string | null
          phone: string | null
          power_backup: boolean | null
          ranking_status: string | null
          reprofiled_at: string | null
          role_experience_score: number | null
          skills_tools_score: number | null
          start_availability: string | null
          status: string | null
          submitted_at: string | null
          total_score: number | null
          us_timezone_ok: boolean | null
          vocaroo_link: string | null
          voice_recording_url: string | null
          whatsapp: string | null
          years_of_experience: number | null
        }
        Insert: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url?: string | null
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50?: boolean | null
          candidate_profile?: string | null
          created_at?: string | null
          currently_working?: boolean | null
          cv_file_url?: string | null
          cv_text?: string | null
          deleted_at?: string
          deleted_by?: string | null
          device_type?: string | null
          email: string
          extracted_skills?: string[] | null
          extracted_tools?: string[] | null
          full_name: string
          good_internet?: boolean | null
          has_experience?: boolean | null
          home_office?: boolean | null
          id?: string
          internet_speed?: string | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title?: string | null
          laptop_or_pc?: boolean | null
          location?: string | null
          noise_canceling_headset?: boolean | null
          notes?: string | null
          original_id: string
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup?: boolean | null
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability?: string | null
          status?: string | null
          submitted_at?: string | null
          total_score?: number | null
          us_timezone_ok?: boolean | null
          vocaroo_link?: string | null
          voice_recording_url?: string | null
          whatsapp?: string | null
          years_of_experience?: number | null
        }
        Update: {
          ai_assessment_details?: Json | null
          ai_summary?: string | null
          apply_url?: string | null
          availability_setup_score?: number | null
          bonus_red_flag_score?: number | null
          can_work_40_50?: boolean | null
          candidate_profile?: string | null
          created_at?: string | null
          currently_working?: boolean | null
          cv_file_url?: string | null
          cv_text?: string | null
          deleted_at?: string
          deleted_by?: string | null
          device_type?: string | null
          email?: string
          extracted_skills?: string[] | null
          extracted_tools?: string[] | null
          full_name?: string
          good_internet?: boolean | null
          has_experience?: boolean | null
          home_office?: boolean | null
          id?: string
          internet_speed?: string | null
          is_starred?: boolean | null
          job_id?: string | null
          job_source?: string | null
          job_title?: string | null
          laptop_or_pc?: boolean | null
          location?: string | null
          noise_canceling_headset?: boolean | null
          notes?: string | null
          original_id?: string
          original_job_id?: string | null
          original_job_title?: string | null
          phone?: string | null
          power_backup?: boolean | null
          ranking_status?: string | null
          reprofiled_at?: string | null
          role_experience_score?: number | null
          skills_tools_score?: number | null
          start_availability?: string | null
          status?: string | null
          submitted_at?: string | null
          total_score?: number | null
          us_timezone_ok?: boolean | null
          vocaroo_link?: string | null
          voice_recording_url?: string | null
          whatsapp?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      deleted_clients: {
        Row: {
          address: string | null
          company_links: string | null
          company_name: string
          contractor_count: number | null
          created_at: string | null
          deleted_at: string
          deleted_by: string | null
          id: string
          industry: string | null
          is_hiring: boolean | null
          leads_from: string | null
          notes: string | null
          original_id: string
          website: string | null
          yearly_increase: boolean | null
        }
        Insert: {
          address?: string | null
          company_links?: string | null
          company_name: string
          contractor_count?: number | null
          created_at?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          industry?: string | null
          is_hiring?: boolean | null
          leads_from?: string | null
          notes?: string | null
          original_id: string
          website?: string | null
          yearly_increase?: boolean | null
        }
        Update: {
          address?: string | null
          company_links?: string | null
          company_name?: string
          contractor_count?: number | null
          created_at?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          industry?: string | null
          is_hiring?: boolean | null
          leads_from?: string | null
          notes?: string | null
          original_id?: string
          website?: string | null
          yearly_increase?: boolean | null
        }
        Relationships: []
      }
      email_fetch_state: {
        Row: {
          current_offset: number
          id: number
          last_run_at: string | null
          updated_at: string
        }
        Insert: {
          current_offset?: number
          id?: number
          last_run_at?: string | null
          updated_at?: string
        }
        Update: {
          current_offset?: number
          id?: number
          last_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
          message_id: string | null
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
          message_id?: string | null
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
          message_id?: string | null
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
          is_default: boolean
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
          is_default?: boolean
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
          is_default?: boolean
          is_enabled?: boolean
          name?: string | null
          status_trigger?: string
          subject?: string
          template_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          export_type: string
          file_url: string | null
          id: string
          processed_items: number | null
          status: string
          total_items: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_type?: string
          file_url?: string | null
          id?: string
          processed_items?: number | null
          status?: string
          total_items?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_type?: string
          file_url?: string | null
          id?: string
          processed_items?: number | null
          status?: string
          total_items?: number | null
          user_id?: string
        }
        Relationships: []
      }
      hiring_request_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_request_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "hiring_request_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_request_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_hiring_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_answers: {
        Row: {
          ai_feedback: string | null
          ai_score: number | null
          answered_at: string
          created_at: string
          id: string
          paste_detected: boolean | null
          pasted_content: string | null
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
          paste_detected?: boolean | null
          pasted_content?: string | null
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
          paste_detected?: boolean | null
          pasted_content?: string | null
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
          second_reminder_sent_at: string | null
          situational_score: number | null
          started_at: string
          status: string
          technical_score: number | null
          updated_at: string
          wrapup_responses: Json | null
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
          second_reminder_sent_at?: string | null
          situational_score?: number | null
          started_at?: string
          status?: string
          technical_score?: number | null
          updated_at?: string
          wrapup_responses?: Json | null
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
          second_reminder_sent_at?: string | null
          situational_score?: number | null
          started_at?: string
          status?: string
          technical_score?: number | null
          updated_at?: string
          wrapup_responses?: Json | null
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
          client_id: string | null
          created_at: string
          department: string | null
          description: string | null
          id: string
          is_active: boolean | null
          linkedin_last_error: string | null
          linkedin_post_id: string | null
          linkedin_post_url: string | null
          linkedin_posted_at: string | null
          post_to_linkedin: boolean
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
          client_id?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          linkedin_last_error?: string | null
          linkedin_post_id?: string | null
          linkedin_post_url?: string | null
          linkedin_posted_at?: string | null
          post_to_linkedin?: boolean
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
          client_id?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          linkedin_last_error?: string | null
          linkedin_post_id?: string | null
          linkedin_post_url?: string | null
          linkedin_posted_at?: string | null
          post_to_linkedin?: boolean
          qualifications?: string[] | null
          rate?: string | null
          region?: string | null
          responsibilities?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_prospects: {
        Row: {
          about: string | null
          converted_lead_id: string | null
          created_at: string
          current_company: string | null
          current_title: string | null
          education: Json
          experience: Json
          full_name: string
          headline: string | null
          id: string
          imported_by: string | null
          industry: string | null
          linkedin_url: string | null
          location: string | null
          notes: string | null
          photo_url: string | null
          skills: Json
          source: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          about?: string | null
          converted_lead_id?: string | null
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          education?: Json
          experience?: Json
          full_name: string
          headline?: string | null
          id?: string
          imported_by?: string | null
          industry?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          photo_url?: string | null
          skills?: Json
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          about?: string | null
          converted_lead_id?: string | null
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          education?: Json
          experience?: Json
          full_name?: string
          headline?: string | null
          id?: string
          imported_by?: string | null
          industry?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          photo_url?: string | null
          skills?: Json
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_prospects_converted_lead_id_fkey"
            columns: ["converted_lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      payoneer_verifications: {
        Row: {
          amount: number | null
          currency: string | null
          error: string | null
          url: string
          verified_at: string
        }
        Insert: {
          amount?: number | null
          currency?: string | null
          error?: string | null
          url: string
          verified_at?: string
        }
        Update: {
          amount?: number | null
          currency?: string | null
          error?: string | null
          url?: string
          verified_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          stage_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          stage_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          stage_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      recurring_contractor_email_schedules: {
        Row: {
          client_id: string | null
          created_at: string
          frequency: string
          id: string
          is_enabled: boolean
          last_sent_at: string | null
          next_run_at: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          frequency: string
          id?: string
          is_enabled?: boolean
          last_sent_at?: string | null
          next_run_at?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          frequency?: string
          id?: string
          is_enabled?: boolean
          last_sent_at?: string | null
          next_run_at?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_contractor_email_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_contractor_email_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contractor_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_notes: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          lead_id: string
          note: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          lead_id: string
          note: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          lead_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          company_name: string
          contact_1_at: string | null
          contact_1_notes: string | null
          contact_1_type: string | null
          contact_2_at: string | null
          contact_2_notes: string | null
          contact_2_type: string | null
          contact_3_at: string | null
          contact_3_notes: string | null
          contact_3_type: string | null
          contact_name: string | null
          converted_at: string | null
          converted_client_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_hires: number
          hiring_type: string[]
          hiring_urgency: string | null
          id: string
          industry: string | null
          likelihood_to_close: number
          original_message: string | null
          phone: string | null
          phone_2: string | null
          role_title: string | null
          source: string
          stage: string
          team_size: string | null
          temperature: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_1_at?: string | null
          contact_1_notes?: string | null
          contact_1_type?: string | null
          contact_2_at?: string | null
          contact_2_notes?: string | null
          contact_2_type?: string | null
          contact_3_at?: string | null
          contact_3_notes?: string | null
          contact_3_type?: string | null
          contact_name?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_hires?: number
          hiring_type?: string[]
          hiring_urgency?: string | null
          id?: string
          industry?: string | null
          likelihood_to_close?: number
          original_message?: string | null
          phone?: string | null
          phone_2?: string | null
          role_title?: string | null
          source?: string
          stage?: string
          team_size?: string | null
          temperature?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_1_at?: string | null
          contact_1_notes?: string | null
          contact_1_type?: string | null
          contact_2_at?: string | null
          contact_2_notes?: string | null
          contact_2_type?: string | null
          contact_3_at?: string | null
          contact_3_notes?: string | null
          contact_3_type?: string | null
          contact_name?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_hires?: number
          hiring_type?: string[]
          hiring_urgency?: string | null
          id?: string
          industry?: string | null
          likelihood_to_close?: number
          original_message?: string | null
          phone?: string | null
          phone_2?: string | null
          role_title?: string | null
          source?: string
          stage?: string
          team_size?: string | null
          temperature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_signatures: {
        Row: {
          created_at: string
          id: string
          last_used_at: string
          recipient_email: string
          signature_data_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string
          recipient_email: string
          signature_data_url: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string
          recipient_email?: string
          signature_data_url?: string
        }
        Relationships: []
      }
      scheduled_contractor_emails: {
        Row: {
          body_html: string
          client_id: string | null
          country: string | null
          created_at: string
          error_message: string | null
          id: string
          processed_items: number | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          total_items: number | null
        }
        Insert: {
          body_html: string
          client_id?: string | null
          country?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          processed_items?: number | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          subject: string
          total_items?: number | null
        }
        Update: {
          body_html?: string
          client_id?: string | null
          country?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          processed_items?: number | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
          total_items?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_contractor_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      stage_settings: {
        Row: {
          color: string | null
          created_at: string
          display_name: string | null
          id: string
          sort_order: number | null
          stage_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          sort_order?: number | null
          stage_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          sort_order?: number | null
          stage_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      get_contractor_checkin_messages: {
        Args: { _contractor_assignment_id: string }
        Returns: {
          body_html: string
          created_at: string
          id: string
          read_at: string
          responses: Json
          sections: Json
          subject: string
          submitted_at: string
          template_type: string
        }[]
      }
      get_my_applicant_id: { Args: never; Returns: string }
      get_my_assigned_assignment_ids: { Args: never; Returns: string[] }
      get_my_client_id: { Args: never; Returns: string }
      get_my_contractor_assignment_id: { Args: never; Returns: string }
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
      is_my_contractor_assignment: {
        Args: { _assignment_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      update_my_client_profile: {
        Args: {
          _address: string
          _company_name: string
          _industry: string
          _website: string
        }
        Returns: undefined
      }
      update_my_portal_user_profile: {
        Args: {
          _full_name: string
          _phone: string
          _primary_email: string
          _secondary_email: string
        }
        Returns: undefined
      }
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
