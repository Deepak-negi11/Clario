
export type Point ={ x:number , y:number};
export const PROXIMITY_RADIUS = 6;


export function tileApart(a:Point , b:Point):number{
    return Math.max(Math.abs(a.x - b.x) , Math.abs(a.y - b.y));
}

export function isNearby(a:Point , b:Point , radius = PROXIMITY_RADIUS){

    return tileApart(a,b) <= radius;
}

