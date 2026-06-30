export interface AuthCredentialsBody {
  email: string;
  password: string;
}

export type SignInBody = AuthCredentialsBody;
export type SignUpBody = AuthCredentialsBody;

export interface AdminSetupBody extends AuthCredentialsBody {
  setupSecret: string;
}

export interface AuthTokenResponse {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  role?: string;
}

export type SignInResponse = AuthTokenResponse;
export type SignUpResponse = AuthTokenResponse;
export type RefreshTokenResponse = AuthTokenResponse;

export interface RefreshTokenBody {
  refreshToken: string;
}

export interface SignOutResponse {
  message: string;
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  oobCode: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}
