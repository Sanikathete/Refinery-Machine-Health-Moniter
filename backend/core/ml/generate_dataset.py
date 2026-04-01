import pandas as pd
import numpy as np
import os

np.random.seed(42)

machines = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']

normal_ranges = {
    'temperature': (60, 85),
    'pressure': (28, 45),
    'vibration': (0.5, 3.0),
    'flow_rate': (50, 80),
    'humidity': (30, 55),
}

spike_ranges = {
    'temperature': (110, 150),
    'pressure': (65, 90),
    'vibration': (7.0, 15.0),
    'flow_rate': (15, 30),
    'humidity': (75, 95),
}

rows = []
start_time = pd.Timestamp('2024-01-01 00:00:00')

for machine in machines:
    num_cycles = np.random.randint(12, 18)
    current_time = start_time

    for cycle in range(num_cycles):
        normal_count = np.random.randint(6, 12)

        for i in range(normal_count):
            row = {
                'timestamp': current_time,
                'machine_id': machine,
                'temperature': round(np.random.uniform(*normal_ranges['temperature']), 2),
                'pressure': round(np.random.uniform(*normal_ranges['pressure']), 2),
                'vibration': round(np.random.uniform(*normal_ranges['vibration']), 2),
                'flow_rate': round(np.random.uniform(*normal_ranges['flow_rate']), 2),
                'humidity': round(np.random.uniform(*normal_ranges['humidity']), 2),
                'failure': 0,
            }
            rows.append(row)
            current_time += pd.Timedelta(hours=1)

        spike_row = {
            'timestamp': current_time,
            'machine_id': machine,
            'temperature': round(np.random.uniform(*spike_ranges['temperature']), 2),
            'pressure': round(np.random.uniform(*spike_ranges['pressure']), 2),
            'vibration': round(np.random.uniform(*spike_ranges['vibration']), 2),
            'flow_rate': round(np.random.uniform(*spike_ranges['flow_rate']), 2),
            'humidity': round(np.random.uniform(*spike_ranges['humidity']), 2),
            'failure': 0,
        }
        rows.append(spike_row)
        current_time += pd.Timedelta(hours=1)

        failure_row = {
            'timestamp': current_time,
            'machine_id': machine,
            'temperature': round(np.random.uniform(*spike_ranges['temperature']), 2),
            'pressure': round(np.random.uniform(*spike_ranges['pressure']), 2),
            'vibration': round(np.random.uniform(*spike_ranges['vibration']), 2),
            'flow_rate': round(np.random.uniform(*spike_ranges['flow_rate']), 2),
            'humidity': round(np.random.uniform(*spike_ranges['humidity']), 2),
            'failure': 1,
        }
        rows.append(failure_row)
        current_time += pd.Timedelta(hours=6)

df = pd.DataFrame(rows)
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
output_path = os.path.join(base_dir, 'data', 'synthetic_data_Predictive_maintenance.csv')
df.to_csv(output_path, index=False)
print(f"Dataset created: {len(df)} rows")
print(f"Failure=1 count: {df['failure'].sum()}")
print(f"Failure=0 count: {(df['failure']==0).sum()}")
print(f"Machines: {df['machine_id'].unique()}")
