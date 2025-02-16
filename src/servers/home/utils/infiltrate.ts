export async function main(ns: NS) {
  
  const locations: ILocation[] = ns.infiltration.getPossibleLocations();
  let info: InfiltrationLocation[] = locations.map(loc => ns.infiltration.getInfiltration(loc.name));
  info.sort((a, b) => a.difficulty - b.difficulty);

  for (const loc of info) {
    const diff = ((loc.difficulty/3)*100).toFixed(2)
    ns.tprint(`[${loc.location.name}] located at [${loc.location.city}] gives ${loc.reward.tradeRep.toFixed(2)} rep -- difficulty: ${diff} %`);
  }


}