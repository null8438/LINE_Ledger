export type TripStatus = "active" | "settling" | "completed";

export type Member = {
  id: string;
  name: string;
  pictureUrl: string | null;
  linked: boolean; // LINE/端末と紐づいているか
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  shareIds: string[];
  createdBy: string | null;
  createdAt: string;
};

export type Settlement = {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  paidAt: string | null;
};

export type TripSummary = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
  total: number;
  memberCount: number;
  expenseCount: number;
  createdAt: string;
  completedAt: string | null;
  faces?: { name: string; pictureUrl: string | null }[];
};

export type TripDetail = TripSummary & {
  members: Member[];
  expenses: Expense[];
  balances: Record<string, { paid: number; owed: number; balance: number }>;
  settlements: Settlement[];
  /** まだ会計していない場合の精算プレビュー */
  preview: { fromId: string; toId: string; amount: number }[];
  meId: string | null;
};
