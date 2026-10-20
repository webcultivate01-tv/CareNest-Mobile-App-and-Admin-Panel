import { createSlice } from "@reduxjs/toolkit";

const doctorSlice = createSlice({
  name: "doctor",
  initialState: {
    doctorData: [],
    doctorStatus: "loading", // "loading" | "ready" | "error"
  },
  reducers: {
    setDoctorData: (state, action) => {
      state.doctorData = action.payload;
    },
    setDoctorStatus: (state, action) => {
      state.doctorStatus = action.payload;
    },
  },
});

export const { setDoctorData, setDoctorStatus } = doctorSlice.actions;
export default doctorSlice.reducer;
