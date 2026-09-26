// Estimated CO2 avoided by charging EVs instead of driving petrol cars the same distance.
//
//   km driven   = kWh / EV consumption (kWh per km)
//   CO2 avoided = km * petrol car CO2 per km  -  kWh * grid CO2 per kWh
//
// The defaults are commonly used estimates, not official figures; GOEC can override each
// one in .env. The portal always labels the result as an estimate and shows the factors.
const DEFAULTS = {
  evKwhPerKm: 0.15, // typical passenger EV
  petrolKgCo2PerKm: 0.17, // typical petrol passenger car
  gridKgCo2PerKwh: 0.024, // hydropower lifecycle emissions (Nepal's grid is mostly hydro)
};

function readFactor(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && process.env[name] !== "" ? value : fallback;
}

function carbonFactors() {
  const evKwhPerKm = readFactor("CARBON_EV_KWH_PER_KM", DEFAULTS.evKwhPerKm) || DEFAULTS.evKwhPerKm;
  return {
    evKwhPerKm,
    petrolKgCo2PerKm: readFactor("CARBON_PETROL_KG_CO2_PER_KM", DEFAULTS.petrolKgCo2PerKm),
    gridKgCo2PerKwh: readFactor("CARBON_GRID_KG_CO2_PER_KWH", DEFAULTS.gridKgCo2PerKwh),
  };
}

function carbonForEnergy(kwh) {
  const f = carbonFactors();
  const energy = Math.max(0, Number(kwh) || 0);
  const km = energy / f.evKwhPerKm;
  const avoided = Math.max(0, km * f.petrolKgCo2PerKm - energy * f.gridKgCo2PerKwh);
  return {
    co2AvoidedKg: Math.round(avoided * 100) / 100,
    kmEquivalent: Math.round(km),
  };
}

module.exports = { carbonFactors, carbonForEnergy };
