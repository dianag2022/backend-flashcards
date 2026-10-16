export interface SendNotificationBody {
  title: string;
  body: string;
  audience: 'all';
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  audience: 'all';
  sentCount: number;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
}

export interface SendNotificationResponse {
  message: string;
  sentCount: number;
}