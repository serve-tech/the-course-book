export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      course_merge_backup_20260915: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string | null;
          id: string | null;
          is_custom: boolean | null;
          logo_url: string | null;
          name: string | null;
          state: string | null;
          website_url: string | null;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          id?: string | null;
          is_custom?: boolean | null;
          logo_url?: string | null;
          name?: string | null;
          state?: string | null;
          website_url?: string | null;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          id?: string | null;
          is_custom?: boolean | null;
          logo_url?: string | null;
          name?: string | null;
          state?: string | null;
          website_url?: string | null;
        };
        Relationships: [];
      };
      course_ranking_import: {
        Row: {
          city: string | null;
          country: string;
          course_name: string;
          created_at: string;
          id: number;
          rank: number;
          ranking_type: string;
          scope_code: string;
          source: string;
          source_url: string;
          source_year: number;
          state: string | null;
        };
        Insert: {
          city?: string | null;
          country: string;
          course_name: string;
          created_at?: string;
          id?: never;
          rank: number;
          ranking_type: string;
          scope_code: string;
          source: string;
          source_url: string;
          source_year: number;
          state?: string | null;
        };
        Update: {
          city?: string | null;
          country?: string;
          course_name?: string;
          created_at?: string;
          id?: never;
          rank?: number;
          ranking_type?: string;
          scope_code?: string;
          source?: string;
          source_url?: string;
          source_year?: number;
          state?: string | null;
        };
        Relationships: [];
      };
      course_rankings: {
        Row: {
          course_id: string;
          id: string;
          rank: number;
          ranking_type: string;
          scope_code: string;
          source: string;
          source_url: string | null;
          source_year: number;
        };
        Insert: {
          course_id: string;
          id?: string;
          rank: number;
          ranking_type: string;
          scope_code: string;
          source: string;
          source_url?: string | null;
          source_year: number;
        };
        Update: {
          course_id?: string;
          id?: string;
          rank?: number;
          ranking_type?: string;
          scope_code?: string;
          source?: string;
          source_url?: string | null;
          source_year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "course_rankings_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string | null;
          id: string;
          is_custom: boolean | null;
          logo_url: string | null;
          name: string;
          state: string | null;
          website_url: string | null;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          id?: string;
          is_custom?: boolean | null;
          logo_url?: string | null;
          name: string;
          state?: string | null;
          website_url?: string | null;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          id?: string;
          is_custom?: boolean | null;
          logo_url?: string | null;
          name?: string;
          state?: string | null;
          website_url?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          id: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          id: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      rounds: {
        Row: {
          course_id: string | null;
          created_at: string | null;
          id: string;
          notes: string | null;
          played_at: string | null;
          score: number | null;
          tees: string | null;
          user_id: string | null;
        };
        Insert: {
          course_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          played_at?: string | null;
          score?: number | null;
          tees?: string | null;
          user_id?: string | null;
        };
        Update: {
          course_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          played_at?: string | null;
          score?: number | null;
          tees?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rounds_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      user_courses: {
        Row: {
          course_id: string | null;
          created_at: string | null;
          first_played: string | null;
          id: string;
          last_played: string | null;
          notes: string | null;
          personal_rank: number | null;
          times_played: number | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          course_id?: string | null;
          created_at?: string | null;
          first_played?: string | null;
          id?: string;
          last_played?: string | null;
          notes?: string | null;
          personal_rank?: number | null;
          times_played?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          course_id?: string | null;
          created_at?: string | null;
          first_played?: string | null;
          id?: string;
          last_played?: string | null;
          notes?: string | null;
          personal_rank?: number | null;
          times_played?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
