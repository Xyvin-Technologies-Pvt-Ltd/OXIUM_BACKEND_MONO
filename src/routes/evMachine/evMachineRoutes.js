const evRoute = require("express").Router();
const evMachineController = require("../../controllers/evMachine/evMachineController");
const oemController = require("../../controllers/evMachine/oemController");
const evModelController = require("../../controllers/evMachine/evModelController");
const dashboardController = require("../../controllers/evMachine/dashboardController");

const asyncHandler = require("../../utils/asyncHandler");

//CRUD operations
evRoute.post(
  "/evMachine/create",
  asyncHandler(evMachineController.createEvMachine)
);
evRoute.get(
  "/evMachine/list",
  asyncHandler(evMachineController.getEvMachineList)
);
evRoute.get(
  "/evMachine/:evMachineId",
  asyncHandler(evMachineController.getEvMachineById)
);
evRoute.get(
  "/evMachine/evMachineCPID/:evMachineCPID",
  asyncHandler(evMachineController.getEvMachineByCPID)
);
evRoute.put(
  "/evMachine/:evMachineId",
  asyncHandler(evMachineController.updateEvMachine)
);
evRoute.delete(
  "/evMachine/:evMachineId",
  asyncHandler(evMachineController.deleteEvMachine)
);
evRoute.get(
  "/evMachine/getChargingTariff/:evMachineCPID",
  asyncHandler(evMachineController.getEvMachineTariffRate)
);
evRoute.delete(
  "/evMachineByStationId/:evMachineId",
  asyncHandler(evMachineController.deleteEvMachineByStationId)
);

evRoute.put(
  "/evMachine/addConnector/:evMachineId",
  asyncHandler(evMachineController.addConnector)
);
evRoute.put(
  "/evMachine/removeConnector/:evMachineId",
  asyncHandler(evMachineController.removeConnector)
);

evRoute.post(
  "/evMachine/updateStatusConnector/:evMachineCPID",
  asyncHandler(evMachineController.updateStatusConnector)
);
evRoute.post(
  "/evMachine/updateStatusCPID/:evMachineCPID",
  asyncHandler(evMachineController.updateStatusCPID)
);
evRoute.post(
  "/evMachine/CPID",
  asyncHandler(evMachineController.getEvByLocation)
);

//OEM
evRoute.post("/oem/create", asyncHandler(oemController.createOEM));
evRoute.get("/oem/list", asyncHandler(oemController.getOEMs));
evRoute.get("/oem/list/dropdown", asyncHandler(oemController.getOEMsDropdown));
evRoute.put("/oem/:id", asyncHandler(oemController.updateOEM));
evRoute.get("/oem/:id", asyncHandler(oemController.getOEM));
evRoute.delete("/oem/:id", asyncHandler(oemController.deleteOEM));

//EV model
evRoute.post("/evModel/create", asyncHandler(evModelController.createEvModel));
evRoute.get("/evModel/list", asyncHandler(evModelController.getEvModels));
evRoute.get(
  "/evModel/list/dropdown",
  asyncHandler(evModelController.getEvModelsDropdown)
);
evRoute.put("/evModel/:id", asyncHandler(evModelController.updateEvModel));
evRoute.delete("/evModel/:id", asyncHandler(evModelController.deleteEvModel));
evRoute.get("/evModel/:id", asyncHandler(evModelController.getEvModel));

//Dashboard
evRoute.get(
  "/evMachine/dashboard/list",
  asyncHandler(dashboardController.getDashboardList)
);
evRoute.get(
  "/evMachine/dashboard/tariffDetails/:cpid",
  asyncHandler(dashboardController.getTariff)
);
evRoute.post(
  "/evMachine/dashboard/changeTariff/:cpid",
  asyncHandler(dashboardController.ChangeTariff)
);
evRoute.get(
  "/evMachine/dashboard/:id",
  asyncHandler(dashboardController.getDashboardListById)
);
evRoute.get(
  "/evMachine/dashboard/report/2",
  asyncHandler(dashboardController.getReport2)
);
evRoute.post(
  "/evMachine/dashboardReport/report",
  asyncHandler(dashboardController.getReport)
);

module.exports = evRoute;
