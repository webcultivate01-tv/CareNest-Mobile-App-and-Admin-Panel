import { createSlice } from "@reduxjs/toolkit";

const patientSlice = createSlice({
  name: "patient",
  initialState: {
    patientData: [],
  },
  reducers: {
    setPatientData: (state, action) => {
      state.patientData = action.payload;
    },
  },
});

export const { setPatientData } = patientSlice.actions;
export default patientSlice.reducer;
