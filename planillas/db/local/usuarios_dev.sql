-- Usuarios de desarrollo local (uno por rol). En Supabase los usuarios vienen de Auth.
insert into usuario (id, email, nombre, rol) values
  ('00000000-0000-0000-0000-00000000d001', 'admin@local', 'Administrador (dev)', 'admin'),
  ('00000000-0000-0000-0000-00000000d002', 'rrhh@local', 'Recursos humanos (dev)', 'rrhh')
on conflict (id) do nothing;
