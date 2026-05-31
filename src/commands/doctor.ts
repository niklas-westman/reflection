export type DoctorCommandOptions = {
  config?: string;
};

export async function doctorCommand(_options: DoctorCommandOptions = {}): Promise<void> {
  console.log('Reflection doctor');
  console.log('Phase 1.1 setup check placeholder: config/schema validation is available; runtime checks come next.');
}
