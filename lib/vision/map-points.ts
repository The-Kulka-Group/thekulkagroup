export type DiscoveryMapPoint = {id:string;name:string;address:string;latitude:number|null;longitude:number|null};

/** Group by screen cells so nearby records stay selectable at every zoom. */
export function groupMapPoints(points:DiscoveryMapPoint[], project:(lat:number,lng:number)=>{x:number;y:number}) {
  const groups=new Map<string,DiscoveryMapPoint[]>();
  for(const point of points){
    if(point.latitude===null || point.longitude===null)continue;
    const pixel=project(point.latitude,point.longitude);
    const key=`${Math.floor(pixel.x/48)}:${Math.floor(pixel.y/48)}`;
    const group=groups.get(key) ?? [];
    group.push(point);groups.set(key,group);
  }
  return [...groups.values()];
}
