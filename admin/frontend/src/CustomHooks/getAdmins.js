import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setAdminListData } from "../redux/adminSlice";

const useGetAdmins = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  useEffect(() => {
    if (!adminData) return;
    const fetchAdmins = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/admin/getadmins", {
          withCredentials: true,
        });
        dispatch(setAdminListData(result.data));
      } catch (error) {
        console.log(error);
      }
    };
    fetchAdmins();
  }, [adminData?.id]);
};

export default useGetAdmins;
