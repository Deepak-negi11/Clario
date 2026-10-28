import type { AvatarLook } from "@repo/shared";
import { apiRequest } from "./api-client";
export { AUTH_TOKEN_KEY } from "./auth-token";

export type SignupInput = {
  username: string;
  email: string;
  password: string;
};

export type SigninInput = {
  email: string;
  password: string;
};

export function signupUser(input: SignupInput) {
  return apiRequest<{ userId: string }, SignupInput>("/api/v1/signup", {
    method: "POST",
    body: input,
  });
}

export function signinUser(input: SigninInput) {
  return apiRequest<{ token: string }, SigninInput>("/api/v1/signin", {
    method: "POST",
    body: input,
  });
}

export type UpdateProfileInput = {
  username?: string;
  email?: string;
  avatarLook?: AvatarLook | null;
};

export function updateProfile(token: string, input: UpdateProfileInput) {
  return apiRequest<{ message: string; username?: string; email?: string }, UpdateProfileInput>("/api/v1/user/profile", {
    method: "POST",
    body: input,
    token,
  });
}

export function getUserProfile(token: string, userId: string) {
  return apiRequest<{ avatars: Array<{ userId: string; imageUrl: string | null; username: string }> }>(`/api/v1/user/metadata/bulk?ids=[${userId}]`, {
    method: "GET",
    token,
  });
}
