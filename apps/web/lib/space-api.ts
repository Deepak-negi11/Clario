import type { AvatarLook, MapTemplateId } from "@repo/shared";
import { apiRequest } from "./api-client";

export type SpaceSummary = {
  id: string;
  name: string;
  dimensions: string;
  thumbnail: string | null;
  mapTemplate: MapTemplateId;
};

export type SpaceElement = {
  id: string;
  element: {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    static: boolean;
  };
  x: number;
  y: number;
};

export type SpaceDetails = {
  name: string;
  dimensions: string;
  mapTemplate: MapTemplateId;
  thumbnail: string | null;
  elements: SpaceElement[];
};

type CreateSpaceInput = {
  name: string;
  dimensions: string;
  mapTemplate: MapTemplateId;
};

export function listSpaces(token: string) {
  return apiRequest<{ spaces: SpaceSummary[] }>("/api/v1/space/all", { token });
}

export function createSpace(token: string, input: CreateSpaceInput) {
  return apiRequest<{ spaceId: string }, CreateSpaceInput>("/api/v1/space", {
    method: "POST",
    token,
    body: input,
  });
}

export function deleteSpace(token: string, spaceId: string) {
  return apiRequest<{ message: string }>(`/api/v1/space/${spaceId}`, {
    method: "DELETE",
    token,
  });
}

export function getSpace(token: string, spaceId: string) {
  return apiRequest<SpaceDetails>(`/api/v1/space/${spaceId}`, { token });
}


export type UserMeta = {
  userId: string;
  imageUrl: string | null;
  username: string;
  /** Custom avatar colours; null or missing means the default character. */
  look?: AvatarLook | null;
};



export function getUsersMetadata(token: string, ids: string[]) {
  const idsParam = encodeURIComponent(`[${ids.join(",")}]`);
  return apiRequest<{ avatars: UserMeta[] }>(
    `/api/v1/user/metadata/bulk?ids=${idsParam}`,
    { token },
  );
}


export type ChatScope = "general" | "room";
export type StoredMessage = {
  id: string;
  userId: string;
  text: string;
  at: number;
  scope: ChatScope;
  roomId?: string;
  roomName?: string;
};

export function getSpaceMessages(
  token: string,
  spaceId: string,
  scope: ChatScope = "general",
  roomId?: string,
) {
  const params = new URLSearchParams({ scope });
  if (roomId) params.set("roomId", roomId);
  return apiRequest<{ messages: StoredMessage[] }>(
    `/api/v1/space/${spaceId}/messages?${params.toString()}`,
    { token },
  );
}


export type Avatar = { id: string; imageUrl: string | null; name: string | null };


export function getAvatars(token: string) {
  return apiRequest<{ avatars: Avatar[] }>("/api/v1/avatars", { token });
}


export function setMyAvatar(token: string, avatarId: string) {
  return apiRequest<{ message: string }, { avatarId: string }>("/api/v1/user/metadata", {
    method: "POST",
    token,
    body: { avatarId },
  });
}


export type SpaceEmailInput = {
  recipientId: string;
  subject: string;
  body: string;
};

export function sendSpaceEmail(token: string, spaceId: string, input: SpaceEmailInput) {
  return apiRequest<{ id: string }, SpaceEmailInput>(`/api/v1/space/${spaceId}/email`, {
    method: "POST",
    token,
    body: input,
  });
}


export type TaskStatus = "todo" | "in-progress" | "done";

export type SpaceTask = {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  assignerId: string;
  assignerName: string;
  assigneeId: string;
  assigneeName: string;
  createdAt: number;
  updatedAt: number;
};

/** isOwner: this user created the space, so they can assign tasks. given is empty otherwise. */
export type SpaceTasks = { isOwner: boolean; received: SpaceTask[]; given: SpaceTask[] };

export type NewTaskInput = { assigneeId: string; subject: string; description: string };

export function listSpaceTasks(token: string, spaceId: string) {
  return apiRequest<SpaceTasks>(`/api/v1/space/${spaceId}/tasks`, { token });
}

export function createSpaceTask(token: string, spaceId: string, input: NewTaskInput) {
  return apiRequest<{ task: SpaceTask }, NewTaskInput>(`/api/v1/space/${spaceId}/tasks`, {
    method: "POST",
    token,
    body: input,
  });
}

export function setSpaceTaskStatus(token: string, spaceId: string, taskId: string, status: TaskStatus) {
  return apiRequest<{ task: SpaceTask }, { status: TaskStatus }>(`/api/v1/space/${spaceId}/tasks/${taskId}/status`, {
    method: "POST",
    token,
    body: { status },
  });
}

export function deleteSpaceTask(token: string, spaceId: string, taskId: string) {
  return apiRequest<{ message: string }>(`/api/v1/space/${spaceId}/tasks/${taskId}`, {
    method: "DELETE",
    token,
  });
}
