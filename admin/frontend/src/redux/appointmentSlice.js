import { createSlice } from "@reduxjs/toolkit";

const appointmentSlice = createSlice({
  name: "appointment",
  initialState: {
    appointmentData: [],
  },
  reducers: {
    setAppointmentData: (state, action) => {
      state.appointmentData = action.payload;
    },
  },
});

export const { setAppointmentData } = appointmentSlice.actions;
export default appointmentSlice.reducer;
