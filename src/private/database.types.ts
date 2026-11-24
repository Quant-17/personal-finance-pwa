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
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          id: string;
          user_id: string;
          table_name: string;
          entity_id: string;
          action: string;
          before_data: Json;
          after_data: Json;
          occurred_at: string;
          provenance: string;
          reason: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      planning_settings: {
        Row: import("./forecast").PlanningSettings & { user_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      planned_cash_events: {
        Row: import("./forecast").PlannedEvent & { user_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      debt_terms: {
        Row: {
          id: string;
          user_id: string;
          loan_id: string | null;
          account_id: string | null;
          prepayment_percent: number;
          closure_fee_paise: number;
          tax_percent: number;
          promo_apr: number | null;
          promo_until: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      statement_rules: {
        Row: import("./statementRules").StatementRule & { user_id: string };
        Insert: import("./statementRules").RuleInput & { enabled?: boolean };
        Update: Partial<import("./statementRules").RuleInput> & {
          enabled?: boolean;
        };
        Relationships: [];
      };
      investment_holdings: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          scheme: string;
          provider: string;
          funding_source: string;
          locked_until: string | null;
          account_id: string | null;
          archived: boolean;
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      investment_entries: {
        Row: {
          id: string;
          user_id: string;
          holding_id: string;
          kind: string;
          amount_paise: number;
          occurred_on: string;
          note: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      loan_document_details: {
        Row: {
          loan_id: string;
          user_id: string;
          source_sha256: string;
          details: Json;
          revision: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_simulations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          price_paise: number;
          apr: number;
          tenure_months: number;
          delay_months: number;
          payment_method: string;
          income_paise: number;
          expenses_paise: number;
          existing_emi_paise: number;
          liquid_cash_paise: number;
          reserve_paise: number;
          calculation_version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          price_paise: number;
          apr: number;
          tenure_months: number;
          delay_months: number;
          payment_method: string;
          income_paise: number;
          expenses_paise: number;
          existing_emi_paise: number;
          liquid_cash_paise: number;
          reserve_paise: number;
          calculation_version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          price_paise?: number;
          apr?: number;
          tenure_months?: number;
          delay_months?: number;
          payment_method?: string;
          income_paise?: number;
          expenses_paise?: number;
          existing_emi_paise?: number;
          liquid_cash_paise?: number;
          reserve_paise?: number;
          calculation_version?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
          opening_balance_paise: number;
          opening_date: string;
          type: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          opening_balance_paise?: number;
          opening_date?: string;
          type: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          opening_balance_paise?: number;
          opening_date?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          category_id: string;
          category_kind: string | null;
          id: string;
          limit_paise: number;
          month: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          category_kind?: string | null;
          id?: string;
          limit_paise: number;
          month: string;
          user_id?: string;
        };
        Update: {
          category_id?: string;
          category_kind?: string | null;
          id?: string;
          limit_paise?: number;
          month?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_user_id_category_kind_fkey";
            columns: ["category_id", "user_id", "category_kind"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "user_id", "kind"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          kind: string;
          name: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          kind: string;
          name: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      goal_allocations: {
        Row: {
          account_id: string;
          amount_paise: number;
          goal_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          amount_paise: number;
          goal_id: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          account_id?: string;
          amount_paise?: number;
          goal_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_allocations_account_id_user_id_fkey";
            columns: ["account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "goal_allocations_goal_id_user_id_fkey";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "savings_goals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      loan_payments: {
        Row: {
          id: string;
          interest_paise: number;
          loan_id: string;
          paid_on: string;
          principal_paise: number;
          transaction_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          interest_paise: number;
          loan_id: string;
          paid_on: string;
          principal_paise: number;
          transaction_id: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          interest_paise?: number;
          loan_id?: string;
          paid_on?: string;
          principal_paise?: number;
          transaction_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_user_id_fkey";
            columns: ["loan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "loans";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "loan_payments_transaction_id_user_id_fkey";
            columns: ["transaction_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      loans: {
        Row: {
          removed_at: string | null;
          progress_first_due_on: string | null;
          payments_reported_through: string | null;
          deduction_anchor_on: string | null;
          reported_emi_paise: number | null;
          card_account_id: string | null;
          apr: number;
          created_at: string;
          emi_paise: number | null;
          id: string;
          name: string;
          principal_paise: number;
          start_date: string;
          status: string;
          tenure_months: number;
          user_id: string;
        };
        Insert: {
          removed_at?: string | null;
          progress_first_due_on?: string | null;
          payments_reported_through?: string | null;
          deduction_anchor_on?: string | null;
          reported_emi_paise?: number | null;
          card_account_id?: string | null;
          apr: number;
          created_at?: string;
          emi_paise?: number | null;
          id?: string;
          name: string;
          principal_paise: number;
          start_date?: string;
          status?: string;
          tenure_months: number;
          user_id?: string;
        };
        Update: {
          removed_at?: string | null;
          progress_first_due_on?: string | null;
          payments_reported_through?: string | null;
          deduction_anchor_on?: string | null;
          reported_emi_paise?: number | null;
          card_account_id?: string | null;
          apr?: number;
          created_at?: string;
          emi_paise?: number | null;
          id?: string;
          name?: string;
          principal_paise?: number;
          start_date?: string;
          status?: string;
          tenure_months?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          tracking_start_date: string | null;
          created_at: string;
          currency: string;
          display_name: string;
          emergency_reserve_paise: number;
          id: string;
          monthly_income_paise: number;
          monthly_living_budget_paise: number;
          timezone: string;
        };
        Insert: {
          tracking_start_date?: string | null;
          created_at?: string;
          currency?: string;
          display_name?: string;
          emergency_reserve_paise?: number;
          id: string;
          monthly_income_paise?: number;
          monthly_living_budget_paise?: number;
          timezone?: string;
        };
        Update: {
          tracking_start_date?: string | null;
          created_at?: string;
          currency?: string;
          display_name?: string;
          emergency_reserve_paise?: number;
          id?: string;
          monthly_income_paise?: number;
          monthly_living_budget_paise?: number;
          timezone?: string;
        };
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          name: string;
          target_on: string | null;
          target_paise: number;
          user_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          target_on?: string | null;
          target_paise: number;
          user_id?: string;
        };
        Update: {
          id?: string;
          name?: string;
          target_on?: string | null;
          target_paise?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          removed_at: string | null;
          account_id: string | null;
          active: boolean;
          amount_paise: number;
          cadence: string;
          id: string;
          name: string;
          next_due_on: string;
          user_id: string;
        };
        Insert: {
          removed_at?: string | null;
          account_id?: string | null;
          active?: boolean;
          amount_paise: number;
          cadence: string;
          id?: string;
          name: string;
          next_due_on: string;
          user_id?: string;
        };
        Update: {
          removed_at?: string | null;
          account_id?: string | null;
          active?: boolean;
          amount_paise?: number;
          cadence?: string;
          id?: string;
          name?: string;
          next_due_on?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_user_id_fkey";
            columns: ["account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      transactions: {
        Row: {
          subscription_id: string | null;
          card_emi_loan_id: string | null;
          account_id: string;
          amount_paise: number;
          category_id: string | null;
          category_kind: string | null;
          created_at: string;
          description: string;
          id: string;
          kind: string;
          occurred_on: string;
          transfer_id: string | null;
          user_id: string;
        };
        Insert: {
          subscription_id?: string | null;
          card_emi_loan_id?: string | null;
          account_id: string;
          amount_paise: number;
          category_id?: string | null;
          category_kind?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          kind: string;
          occurred_on: string;
          transfer_id?: string | null;
          user_id?: string;
        };
        Update: {
          subscription_id?: string | null;
          card_emi_loan_id?: string | null;
          account_id?: string;
          amount_paise?: number;
          category_id?: string | null;
          category_kind?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          kind?: string;
          occurred_on?: string;
          transfer_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_user_id_fkey";
            columns: ["account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "transactions_category_id_user_id_category_kind_fkey";
            columns: ["category_id", "user_id", "category_kind"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "user_id", "kind"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      account_statement_report: {
        Args: { p_account: string; p_month: string };
        Returns: Json;
      };
      reconcile_account: {
        Args: {
          p_account: string;
          p_month: string;
          p_opening: number;
          p_closing: number;
          p_expected_hash: string;
        };
        Returns: string;
      };
      monthly_review_report: { Args: { p_month: string }; Returns: Json };
      review_month: {
        Args: { p_month: string; p_expected_hash: string };
        Returns: string;
      };
      preview_transfer_match: { Args: { p_spec: Json }; Returns: Json };
      confirm_transfer_match: {
        Args: { p_spec: Json; p_request_id: string };
        Returns: string;
      };
      save_planning: { Args: { p_settings: Json }; Returns: undefined };
      save_planned_event: {
        Args: { p_id: string | null; p_event: Json; p_delete?: boolean };
        Returns: string;
      };
      save_debt_terms: {
        Args: {
          p_loan: string | null;
          p_account: string | null;
          p_terms: Json;
        };
        Returns: string;
      };
      forecast_context: { Args: never; Returns: Json };
      investment_return_history: { Args: { p_holding: string }; Returns: Json };
      preview_financial_restore: { Args: { p_archive: Json }; Returns: Json };
      confirm_financial_restore: {
        Args: {
          p_archive: Json;
          p_expected_hash: string;
          p_confirmation: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      export_financial_data: { Args: never; Returns: Json };
      delete_own_account: {
        Args: { p_confirmation: string };
        Returns: boolean;
      };
      link_card_emi_deduction: {
        Args: { p_loan: string | null; p_transaction: string };
        Returns: string;
      };
      link_subscription_deduction: {
        Args: { p_subscription: string | null; p_transaction: string };
        Returns: string;
      };
      record_subscription_charge: {
        Args: {
          p_subscription: string;
          p_account: string;
          p_category: string;
          p_amount_paise: number;
          p_occurred_on: string;
          p_request_id: string;
        };
        Returns: string;
      };
      preview_statement_import: {
        Args: { p_account: string; p_source_sha256: string; p_rows: Json };
        Returns: Json;
      };
      import_statement_entries: {
        Args: {
          p_account: string;
          p_source_sha256: string;
          p_rows: Json;
          p_request_id: string;
        };
        Returns: Json;
      };
      investment_portfolio: { Args: never; Returns: Json };
      save_investment_holding: {
        Args: {
          p_holding: string | null;
          p_expected_revision: number;
          p_terms: Json;
          p_initial_value_paise: number | null;
          p_valued_on: string | null;
          p_request_id: string;
        };
        Returns: string;
      };
      record_investment_entry: {
        Args: {
          p_holding: string;
          p_expected_revision: number;
          p_entry: string | null;
          p_kind: string;
          p_amount_paise: number;
          p_occurred_on: string;
          p_note: string;
          p_delete: boolean;
          p_request_id: string;
        };
        Returns: string;
      };
      save_loan_document: {
        Args: {
          p_loan: string | null;
          p_expected_revision: number;
          p_terms: Json;
          p_request_id: string;
        };
        Returns: string;
      };
      preview_csv_import: {
        Args: { p_account: string; p_rows: Json };
        Returns: Json;
      };
      import_csv_entries: {
        Args: { p_account: string; p_rows: Json; p_request_id: string };
        Returns: Json;
      };
      delete_entry: {
        Args: { p_entry: string; p_request_id?: string };
        Returns: undefined;
      };
      initialize_workspace: { Args: never; Returns: undefined };
      record_entry: {
        Args: {
          p_account: string;
          p_amount_paise: number;
          p_category: string;
          p_description: string;
          p_entry?: string;
          p_kind: string;
          p_occurred_on: string;
          p_request_id?: string;
        };
        Returns: string;
      };
      record_loan_payment: {
        Args: {
          p_account: string;
          p_description: string;
          p_interest_paise: number;
          p_loan: string;
          p_occurred_on: string;
          p_principal_paise: number;
          p_request_id?: string;
        };
        Returns: string;
      };
      record_transfer: {
        Args: {
          p_amount_paise: number;
          p_description: string;
          p_from: string;
          p_occurred_on: string;
          p_request_id?: string;
          p_to: string;
        };
        Returns: string;
      };
      set_goal_allocation: {
        Args: {
          p_account: string;
          p_amount_paise: number;
          p_goal: string;
          p_request_id?: string;
        };
        Returns: undefined;
      };
      remove_commitment: {
        Args: {
          p_kind: string;
          p_id: string;
          p_expected_balance: number;
          p_expected_budget: number;
          p_reduce_budget: boolean;
          p_confirmation: string;
        };
        Returns: undefined;
      };
      workspace_snapshot: { Args: never; Returns: Json };
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
