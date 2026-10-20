import { createSlice } from "@reduxjs/toolkit";

const adminSlice = createSlice({
  name: "admin",
  initialState: {
    adminData: null,
    authChecked: false,
  },
  reducers: {
    setAdminData: (state, action) => {
      state.adminData = action.payload;
    },
    setAuthChecked: (state, action) => {
      state.authChecked = action.payload;
    },
  },
});

export const { setAdminData, setAuthChecked } = adminSlice.actions;
export default adminSlice.reducer;
