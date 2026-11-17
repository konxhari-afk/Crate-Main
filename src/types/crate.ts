export interface YTMusicSearchResult {
  title: string;
  artist: string;
  albumArt: string;
  videoId: string;
  album?: string;
  duration?: number;
}

export interface UserPreferences {
  languages: string[];
  genres: string[];
  artists: string[];
}

export interface Track {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  artworkUrl: string;
  audioUrl?: string;
  language?: string;
  source?: 'ytmusic' | 'curated' | 'silent-queue' | 'offline-sandbox';
  aiReason?: string;
  playCount?: number;
  localFileUri?: string;
  isOfflineDownloaded?: boolean;
}

export interface DownloadedTrackRecord {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  localFileUri: string; // e.g., Directory.Data/tracks/[videoId].mp3
  sandboxPath: string; // tracks/[videoId].mp3
  album?: string;
  duration?: number;
  mimeType?: string;
  sizeBytes?: number;
  downloadedAt: string; // ISO timestamp
}

export interface PlayHistoryRecord {
  id: string;
  user_id: string;
  video_id: string;
  title: string;
  artist: string;
  album_art: string;
  played_at: string; // ISO timestamp
  duration?: number;
  album?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  coverImages?: string[];
  accent?: string;
  category?: string;
  tags?: string[];
  tracks: Track[];
  isAutoTopTracks?: boolean;
  topTracksPeriod?: 'weekly' | 'monthly';
  autoExpireEnabled?: boolean;
  isDownloadsPlaylist?: boolean;
}

export interface ArtistProfile {
  id: string;
  name: string;
  avatarUrl: string;
  genre: string;
  monthlyListeners: string;
  verified: boolean;
  topTracks: Track[];
}

export interface UserProfile {
  id: string;
  email: string;
  mobile_number: string;
  password?: string;
  full_name: string;
  avatar_url: string;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
  preferences?: UserPreferences;
}

export interface EqualizerBand {
  frequency: number;
  label: string;
  type: BiquadFilterType;
  gain: number; // -12 to +12 dB
}

export interface RoomParticipant {
  id: string;
  name: string;
  avatarUrl: string;
  isHost: boolean;
}

export interface ListenTogetherState {
  roomId: string;
  hostId: string;
  hostName: string;
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  participants: RoomParticipant[];
}

export type AppRoute =
  | '/'
  | '/login'
  | '/onboarding'
  | '/access-denied'
  | '/owner'
  | '/blend'
  | '/listen-together';
