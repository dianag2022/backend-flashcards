export interface SendNotificationBody {
  title: string;
  body: string;
  audience: 'all';
}

export interface SendNotificationResponse {
  message: string;
  sentCount: number;
}