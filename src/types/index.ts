export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  updated_at: string;
  created_at: string;
};

export type ConnectedPlatform = {
  id: string;
  user_id: string;
  platform: string;
  platform_username: string | null;
  connected_at: string;
  is_active: boolean;
};
