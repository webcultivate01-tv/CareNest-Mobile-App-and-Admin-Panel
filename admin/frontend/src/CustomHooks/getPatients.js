import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setPatientData } from "../redux/patientSlice";

const useGetPatients = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  useEffect(() => {
    if (!adminData) return;
    const fetchPatients = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/patient/getpatients", {
          withCredentials: true,
        });
        dispatch(setPatientData(result.data));
      } catch (error) {
        console.log(error);
      }
    };
    fetchPatients();
  }, [adminData]);
};

export default useGetPatients;
