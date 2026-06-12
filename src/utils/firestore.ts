import { Timestamp } from 'firebase-admin/firestore';

export function toIsoString(value: Timestamp | Date | string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}
