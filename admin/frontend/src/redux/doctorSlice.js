import { createSlice } from "@reduxjs/toolkit";

const doctorSlice = createSlice({
  name: "doctor",
  initialState: {
    doctorData: [],
  },
  reducers: {
    setDoctorData: (state, action) => {
      state.doctorData = action.payload;
    },
  },
});

export const { setDoctorData } = doctorSlice.actions;
export default doctorSlice.reducer;
