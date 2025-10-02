export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chat_feedback: {
        Row: {
          created_at: string | null
          feedback_text: string | null
          feedback_type: string | null
          id: string
          message_id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          message_id: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          message_id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      deck_versions: {
        Row: {
          changes: string | null
          created_at: string | null
          data: Json
          deck_id: string | null
          id: string
          user_id: string | null
          version_number: number
        }
        Insert: {
          changes?: string | null
          created_at?: string | null
          data: Json
          deck_id?: string | null
          id?: string
          user_id?: string | null
          version_number?: number
        }
        Update: {
          changes?: string | null
          created_at?: string | null
          data?: Json
          deck_id?: string | null
          id?: string
          user_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_versions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["uuid"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string | null
          data: Json | null
          description: string | null
          id: string
          last_modified: string | null
          name: string
          outline: Json | null
          size: Json | null
          slides: Json | null
          status: Json | null
          tags: Json | null
          updated_at: string | null
          user_id: string | null
          uuid: string | null
          version: string | null
          visibility: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          last_modified?: string | null
          name: string
          outline?: Json | null
          size?: Json | null
          slides?: Json | null
          status?: Json | null
          tags?: Json | null
          updated_at?: string | null
          user_id?: string | null
          uuid?: string | null
          version?: string | null
          visibility?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          last_modified?: string | null
          name?: string
          outline?: Json | null
          size?: Json | null
          slides?: Json | null
          status?: Json | null
          tags?: Json | null
          updated_at?: string | null
          user_id?: string | null
          uuid?: string | null
          version?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      palettes: {
        Row: {
          colors: Json
          created_at: string | null
          id: string
          is_public: boolean | null
          name: string
          tag_string: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          colors?: Json
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          tag_string?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          colors?: Json
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          tag_string?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      slide_templates: {
        Row: {
          auto_tags: Json | null
          content: Json | null
          created_at: string | null
          custom_tags: Json | null
          description: string | null
          design_description: string | null
          design_embedding: string | null
          embedding: string | null
          image_url: string | null
          lastmodified: string | null
          name: string
          size: Json | null
          slides: Json
          uuid: string
          visual_analysis: Json | null
        }
        Insert: {
          auto_tags?: Json | null
          content?: Json | null
          created_at?: string | null
          custom_tags?: Json | null
          description?: string | null
          design_description?: string | null
          design_embedding?: string | null
          embedding?: string | null
          image_url?: string | null
          lastmodified?: string | null
          name: string
          size?: Json | null
          slides: Json
          uuid?: string
          visual_analysis?: Json | null
        }
        Update: {
          auto_tags?: Json | null
          content?: Json | null
          created_at?: string | null
          custom_tags?: Json | null
          description?: string | null
          design_description?: string | null
          design_embedding?: string | null
          embedding?: string | null
          image_url?: string | null
          lastmodified?: string | null
          name?: string
          size?: Json | null
          slides?: Json
          uuid?: string
          visual_analysis?: Json | null
        }
        Relationships: []
      }
      yjs_snapshots: {
        Row: {
          data: string
          deck_id: string | null
          id: string
          metadata: Json | null
          timestamp: string | null
          version: string
        }
        Insert: {
          data?: string
          deck_id?: string | null
          id?: string
          metadata?: Json | null
          timestamp?: string | null
          version?: string
        }
        Update: {
          data?: string
          deck_id?: string | null
          id?: string
          metadata?: Json | null
          timestamp?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "yjs_snapshots_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["uuid"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      search_templates_by_embedding: {
        Args: {
          query_embedding: string
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          uuid: string
          created_at: string
          name: string
          slides: Json
          description: string
          content: Json
          auto_tags: Json
          custom_tags: Json
          lastmodified: string
          size: Json
          embedding: string
          design_description: string
          visual_analysis: Json
          image_url: string
          similarity: number
        }[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
