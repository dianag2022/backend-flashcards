export interface AuthCredentialsBody {
  email: string;
  password: string;
}

export type SignInBody = AuthCredentialsBody;
export type SignUpBody = AuthCredentialsBody;

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

export interface SignOutResponse {
  message: string;
}
