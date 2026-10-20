import { createSlice } from "@reduxjs/toolkit";

const adminSlice = createSlice({
  name: "admin",
  initialState: {
    adminData: null,
    authChecked: false,
    adminListData: [],
  },
  reducers: {
    setAdminData: (state, action) => {
      state.adminData = action.payload;
    },
    setAuthChecked: (state, action) => {
      state.authChecked = action.payload;
    },
    setAdminListData: (state, action) => {
      state.adminListData = action.payload;
    },
  },
});

export const { setAdminData, setAuthChecked, setAdminListData } =adminSlice.actions;
export default adminSlice.reducer;
