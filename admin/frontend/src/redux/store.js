import { configureStore } from "@reduxjs/toolkit";
import adminSlice from "./adminSlice.js";
import doctorSlice from "./doctorSlice.js";
import patientSlice from "./patientSlice.js";
import appointmentSlice from "./appointmentSlice.js";
import dashboardSlice from "./dashboardSlice.js";

export const store = configureStore({
  reducer: {
    admin: adminSlice,
    doctor: doctorSlice,
    patient: patientSlice,
    appointment: appointmentSlice,
    dashboard: dashboardSlice,
  },
});
