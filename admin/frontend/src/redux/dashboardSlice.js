import { createSlice } from "@reduxjs/toolkit";

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState: {
    statsData: null,
  },
  reducers: {
    setStatsData: (state, action) => {
      state.statsData = action.payload;
    },
  },
});

export const { setStatsData } = dashboardSlice.actions;
export default dashboardSlice.reducer;
