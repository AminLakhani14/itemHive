import React from "react";
import { Alert, MenuItem, TextField } from "@mui/material";
import api from "../../api/axios";
import { requestError } from "./PayrollShared";
export default function SalespersonSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [data, setData] = React.useState<{
    required: boolean;
    defaultEmployeeId: string;
    employees: Array<{ _id: string; fullName: string; employeeCode: string }>;
  }>();
  const [error, setError] = React.useState("");
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      try {
        const result = (await api.get("/salespeople")).data;
        if (!active || current !== generation) return;
        setData(result);
        setError("");
        if (!valueRef.current) onChangeRef.current(result.defaultEmployeeId);
      } catch (e) {
        if (active && current === generation) setError(requestError(e));
      }
    };
    void load();
    const changed = () => {
      onChangeRef.current("");
      setData(undefined);
      void load();
    };
    window.addEventListener("itemhive-workspace-changed", changed);
    return () => {
      active = false;
      window.removeEventListener("itemhive-workspace-changed", changed);
    };
  }, []);
  if (error) return <Alert severity="error">Salesperson lookup: {error}</Alert>;
  if (!data?.required) return null;
  return (
    <TextField
      fullWidth
      select
      required
      label="Salesperson"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText="Commission belongs to this employee, excluding sales tax."
    >
      <MenuItem value="">Select employee</MenuItem>
      {data.employees.map((e) => (
        <MenuItem key={e._id} value={e._id}>
          {e.employeeCode} · {e.fullName}
        </MenuItem>
      ))}
    </TextField>
  );
}
