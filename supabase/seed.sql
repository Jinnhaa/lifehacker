insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001','amber.local@example.test','',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles(id,display_name) values ('10000000-0000-4000-8000-000000000001','Amber Local') on conflict do nothing;
insert into public.user_settings(user_id,week_starts_on,planning_buffer_minutes,monthly_ai_budget_krw)
values ('10000000-0000-4000-8000-000000000001',1,15,50000) on conflict do nothing;
insert into public.scopes(id,user_id,kind,label) values ('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','global','Global') on conflict do nothing;
insert into public.workstyle_profiles(id,user_id,scope_type,agent_type,revision,instructions,directives) values
('18000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','global',null,1,
 array['결론 먼저','기존 맥락 활용','근거와 이유 제시','추상론보다 실행안','바로 쓸 수 있는 결과물','가장 좋은 안 우선','문제 있으면 지적','반복과 장황함 회피','이미 아는 정보 재질문 금지'],
 '{"conclusion_first":true,"use_existing_context":true,"include_reasoning":true,"actionable":true,"ready_to_use":true,"recommend_best_first":true,"challenge_problems":true,"concise":true,"do_not_reask_known":true}'),
('18000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','agent','project_pm',1,
 array['문제, 사용자, 흐름 우선','실제 사용자 효용 확인','UX 앞뒤 흐름 확인','불필요한 기능 제거','구현 가능한 수준까지 구체화','기존 제품 맥락 유지'],
 '{"problem_user_flow_first":true,"verify_user_value":true,"check_ux_flow":true,"remove_unnecessary_features":true,"implementation_ready":true,"preserve_product_context":true}'),
('18000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','agent','research',1,
 array['의사결정에 필요한 자료 우선','숫자는 출처','1차 또는 공신력 출처 우선','주장과 근거 연결','불확실성 명시','그래서 무엇을 해야 하는지까지','자료 나열보다 바로 쓸 결과'],
 '{"decision_relevant_research":true,"source_numbers":true,"prefer_primary_sources":true,"connect_claims_evidence":true,"state_uncertainty":true,"include_action_implication":true,"ready_to_use":true}'),
('18000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','agent','development',1,
 array['기존 architecture 유지','관련 파일만 읽기','범위 밖 확장 금지','targeted test 우선','전체 test 마지막 1회','구현 후 commit','완료 보고 짧게','token 낭비 최소화'],
 '{"preserve_architecture":true,"read_related_only":true,"no_scope_expansion":true,"targeted_tests_first":true,"full_test_once_last":true,"commit_after_implementation":true,"brief_completion_report":true,"minimize_tokens":true}')
on conflict(id) do update set instructions=excluded.instructions,directives=excluded.directives,active=true,updated_at=now();
insert into public.agent_templates(id,user_id,template_key,version,name,role,instructions,active) values
('16000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','chief','builtin-v0.1','Chief','chief','Observe user state and provide read-only coordination.',true),
('16000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','project_pm','builtin-v0.1','Project PM','project_pm','Report read-only project status and next actions.',true)
on conflict(user_id,template_key,version) do update set active=true;
insert into public.agent_instances(id,user_id,agent_template_id,template_version,name,home_scope_id,status)
select '17000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',t.id,t.version,'Chief',
  '11000000-0000-4000-8000-000000000001','active'
from public.agent_templates t
where t.user_id='10000000-0000-4000-8000-000000000001' and t.template_key='chief' and t.version='builtin-v0.1'
  and not exists(select 1 from public.agent_instances i join public.agent_templates existing
    on existing.id=i.agent_template_id and existing.user_id=i.user_id
    where i.user_id=t.user_id and existing.template_key='chief'
      and i.home_scope_id='11000000-0000-4000-8000-000000000001' and i.status='active');
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
