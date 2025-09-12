// scripts/migrate_flights_add_metrics.js
require('dotenv').config();
const mongoose = require('mongoose');
const Flight = require('../src/models/flight.model');

function minutesBetween(a,b){ if(!a||!b) return null; return Math.round((new Date(b)-new Date(a))/60000); }
function haversineKm(lat1, lon1, lat2, lon2){
  if (![lat1,lon1,lat2,lon2].every(v=>typeof v==='number')) return null;
  const toRad = v => v*Math.PI/180; const R=6371;
  const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R*c);
}

async function main(){
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true });
  const flights = await Flight.find({}).lean();
  console.log('Flights found', flights.length);
  for(const f of flights){
    const updates = { segments: [] };
    for(const seg of (f.segments||[])){
      const travelTimeMinutes = seg.travelTimeMinutes || minutesBetween(seg.departureTime, seg.arrivalTime) || null;
      let distanceKm = seg.distanceKm || null;
      if ((!distanceKm || distanceKm===0) && seg.origin?.lat && seg.origin?.lon && seg.destination?.lat && seg.destination?.lon) {
        distanceKm = haversineKm(seg.origin.lat, seg.origin.lon, seg.destination.lat, seg.destination.lon);
      }
      updates.segments.push(Object.assign({}, seg, { travelTimeMinutes, distanceKm }));
    }
    await Flight.updateOne({ _id: f._id }, { $set: { segments: updates.segments } });
    console.log('Updated flight', f._id);
  }
  console.log('Done');
  mongoose.disconnect();
}
main().catch(err=>{ console.error(err); process.exit(1); });
