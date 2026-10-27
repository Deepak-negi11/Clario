import { getChatRoomAtPosition, ServerMessage } from "@repo/shared";
import { redis } from "./redis";
import { broadcast, broadcastWhere } from "./room-manager";


















const SERVER_ID = crypto.randomUUID();


type RoomEvent = {
  serverId: string;
  spaceId: string;
  exceptUserId: string;
  message: ServerMessage;
  roomFilter?: { mapTemplate: string; roomId: string };
  createdAt: number;
};



let subscriber: Awaited<ReturnType<typeof redis.duplicate>> | null = null;




const subscribedSpaces = new Set<string>();







const pendingSubscriptions = new Map<string, Promise<void>>();


function closeSubscriber() {
  try {
    subscriber?.close();
  } catch {

  } finally {
    subscriber = null;
  }
}



function roomChannel(spaceId: string) {
  return `space:${spaceId}:events`;
}






function parseRoomEvent(raw: string): RoomEvent | null {
  try {
    const data = JSON.parse(raw) as Partial<RoomEvent>;

    if (
      typeof data.serverId !== "string" ||
      typeof data.spaceId !== "string" ||
      typeof data.exceptUserId !== "string" ||
      typeof data.createdAt !== "number"
    ) {
      return null;
    }

    const message = ServerMessage.safeParse(data.message);
    if (!message.success) return null;

    return {
      serverId: data.serverId,
      spaceId: data.spaceId,
      exceptUserId: data.exceptUserId,
      message: message.data,
      roomFilter: data.roomFilter
        && typeof data.roomFilter === "object"
        && typeof data.roomFilter.mapTemplate === "string"
        && typeof data.roomFilter.roomId === "string"
        ? data.roomFilter
        : undefined,
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}



async function getSubscriber() {
  if (!subscriber) {

    subscriber = await redis.duplicate();
  }

  return subscriber;
}









export async function subscribeToSpaceEvents(spaceId: string) {
  if (subscribedSpaces.has(spaceId)) return;



  const pending = pendingSubscriptions.get(spaceId);
  if (pending) return pending;





  const subscription = (async () => {
    try {
      const activeSubscriber = await getSubscriber();





      await activeSubscriber.subscribe(roomChannel(spaceId), (raw) => {
        const event = parseRoomEvent(raw);

        if (!event || event.serverId === SERVER_ID) return;

        if (event.roomFilter) {


          broadcastWhere(event.spaceId, event.exceptUserId, event.message, (member) => (

            getChatRoomAtPosition(event.roomFilter!.mapTemplate, member)?.id === event.roomFilter!.roomId
          ));
        } else {
          broadcast(event.spaceId, event.exceptUserId, event.message);
        }
      });

      subscribedSpaces.add(spaceId);



    } finally {
      pendingSubscriptions.delete(spaceId);
    }
  })();

  pendingSubscriptions.set(spaceId, subscription);

  await subscription;
}




export async function unsubscribeFromSpaceEvents(spaceId: string) {
  if (!subscriber || !subscribedSpaces.has(spaceId)) return;

  try {
    await subscriber.unsubscribe(roomChannel(spaceId));
  } catch {
  }


  subscribedSpaces.delete(spaceId);

  if (subscribedSpaces.size === 0) {
    closeSubscriber();
  }
}


export async function publishRoomEvent(
  spaceId: string,
  exceptUserId: string,
  message: ServerMessage,
  roomFilter?: { mapTemplate: string; roomId: string },
) {
  const event: RoomEvent = {
    serverId: SERVER_ID,
    spaceId,
    exceptUserId,
    message,
    roomFilter,
    createdAt: Date.now(),
  };

  await redis.publish(roomChannel(spaceId), JSON.stringify(event));
}





export async function stopAllRoomEventSubscriptions() {
  if (!subscriber) return;

  try {
    await subscriber.unsubscribe();
  } catch {

  }

  closeSubscriber();
  subscribedSpaces.clear();
  pendingSubscriptions.clear();
}
