export type SkyAiUserTodo = {
  kind: string;
  count: number;
  summary: string;
  path: string;
};

export type SkyAiUserContext = {
  signedIn: boolean;
  emailVerified: boolean;
  sellerVerified: boolean;
  stripeConnected: boolean;
  kycStatus: string;
  accountAgeDays: number;
  todos: SkyAiUserTodo[];
};
