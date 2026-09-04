insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001','amber.local@example.test','',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles(id,display_name) values ('10000000-0000-4000-8000-000000000001','Amber Local') on conflict do nothing;
insert into public.user_settings(user_id,week_starts_on,planning_buffer_minutes,monthly_ai_budget_krw)
values ('10000000-0000-4000-8000-000000000001',1,15,50000) on conflict do nothing;
insert into public.scopes(id,user_id,kind,label) values ('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','global','Global') on conflict do nothing;
insert into public.goals(id,user_id,scope_id,title,importance,status,origin) values
('12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','학점',5,'active','user'),
('12000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','일본어',4,'active','user') on conflict do nothing;
insert into public.work_contexts(id,user_id,scope_id,kind,title,status,agent_mode) values
('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','course','샘플 과목','active','not_applicable') on conflict do nothing;
insert into public.course_profiles(work_context_id,user_id,term) values
('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','local') on conflict do nothing;
insert into public.recurring_activities(id,user_id,goal_id,title,category,period,target_count,expected_minutes,scheduling_mode,importance,effective_from,active) values
('14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','일본어 공부','study','week',3,30,'flexible',4,current_date,true) on conflict do nothing;
insert into public.tasks(id,user_id,work_context_id,title,execution_mode,actual_minutes,importance,status) values
('15000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','샘플 과제','learning_required',0,4,'INBOX') on conflict do nothing;
