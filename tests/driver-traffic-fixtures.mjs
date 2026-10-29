// Synthetic provider fixtures only; no real driver locations or external requests.
export const origin={lat:41.69,lon:-88.06},destination={lat:41.70,lon:-88.04};
export function providerRoute({west=false,seconds=600,closed=false}={}){
 const lon=west?-88.065:-88.055,points=[origin,{lat:origin.lat,lon},{lat:destination.lat,lon},destination].map(p=>({latitude:p.lat,longitude:p.lon}));
 const instructions=[['DEPART',0,0,0],['TURN_RIGHT',1,500,100],['ROUNDABOUT_RIGHT',2,2000,400],['ARRIVE',3,5000,seconds]].map(([maneuver,index,offset,time])=>({maneuver,pointIndex:index,point:points[index],routeOffsetInMeters:offset,travelTimeInSeconds:time,message:index===1?(west?'Turn left onto Synthetic west road':'Turn right onto Synthetic east road'):index===2?'At the roundabout take exit 2 onto Synthetic depot road':index===3?'You have arrived':'Head forward',street:index===1?(west?'Synthetic west road':'Synthetic east road'):'Synthetic road',roadNumbers:index===1?['I-55']:[],roundaboutExitNumber:index===2?2:undefined,drivingSide:'RIGHT'}));
 return {summary:{lengthInMeters:5000,travelTimeInSeconds:seconds,noTrafficTravelTimeInSeconds:500,trafficDelayInSeconds:Math.max(0,seconds-500)},legs:[{points}],guidance:{instructions},sections:closed?[{sectionType:'TRAFFIC',simpleCategory:'ROAD_CLOSURE'}]:[]};
}
