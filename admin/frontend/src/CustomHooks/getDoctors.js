import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setDoctorData } from "../redux/doctorSlice";

const useGetDoctors = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  useEffect(() => {
    if (!adminData) return;
    const fetchDoctors = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/doctor/getdoctors", {
          withCredentials: true,
        });
        dispatch(setDoctorData(result.data));
      } catch (error) {
        console.log(error);
      }
    };
    fetchDoctors();
  }, [adminData]);
};

export default useGetDoctors;
