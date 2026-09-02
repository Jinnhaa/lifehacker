begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(id,email,created_at,updated_at) values
('20000000-0000-0000-0000-000000000001','owner-a@example.test',now(),now()),
('20000000-0000-0000-0000-000000000002','owner-b@example.test',now(),now());
insert into public.profiles(id) values
('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
insert into public.scopes(id,user_id,kind,label) values
('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','global','A'),
('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','global','B'),
('21000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','custom','A2');
insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values
('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','project','A project','active','auto'),
('22000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','course','A course','active','not_applicable'),
('22000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','project','A other','active','auto');
insert into public.objectives(id,user_id,title,importance,status,origin) values
('23000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Standalone',3,'active','user');
insert into public.objectives(id,user_id,work_context_id,title,importance,status,origin) values
('23000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Context objective',3,'active','user');

select ok(exists(select 1 from public.objectives where id='23000000-0000-0000-0000-000000000001' and goal_id is null and work_context_id is null),'Objective can be standalone');
select throws_ok($$insert into public.objectives(user_id,scope_id,title,importance,status,origin) values('20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000002','cross-user',3,'active','user')$$,'23503',null,'same-user composite FK rejects cross-user ownership');
select throws_like($$insert into public.course_profiles(work_context_id,user_id) values('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')$$,'%course extension requires%','CourseProfile rejects Project WorkContext');

insert into public.recurring_activities(id,user_id,title,category,period,target_count,expected_minutes,scheduling_mode,importance,effective_from,active)
values('24000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Study','study','week',2,30,'flexible',3,current_date,true);
insert into public.activity_occurrences(user_id,recurring_activity_id,period_key,sequence_no,status,counts_toward_target)
values('20000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','2026-W36',1,'planned',true);
select throws_ok($$insert into public.activity_occurrences(user_id,recurring_activity_id,period_key,sequence_no,status,counts_toward_target) values('20000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','2026-W36',1,'planned',true)$$,'23505',null,'occurrence period and sequence are unique');
select throws_ok($$insert into public.tasks(user_id,title,execution_mode,importance,status) values('20000000-0000-0000-0000-000000000001','bad','standard',3,'PAUSED')$$,'23514',null,'invalid Task status is rejected');
select throws_like($$insert into public.tasks(user_id,work_context_id,objective_id,title,execution_mode,importance,status) values('20000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000003','23000000-0000-0000-0000-000000000002','mismatch','standard',3,'INBOX')$$,'%WorkContext mismatch%','Task and Objective WorkContext mismatch is rejected');

insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status)
values('25000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Task','standard',3,'INBOX');
insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by)
values('20000000-0000-0000-0000-000000000001','2026-09-02','Asia/Seoul',1,'approved','{}','user');
select throws_ok($$insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by) values('20000000-0000-0000-0000-000000000001','2026-09-02','Asia/Seoul',2,'approved','{}','user')$$,'23505',null,'only one approved plan exists per user and date');
select throws_like($$insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,planned_minutes,status) select '20000000-0000-0000-0000-000000000001',id,1,'task','25000000-0000-0000-0000-000000000001',30,'planned' from public.daily_plans where user_id='20000000-0000-0000-0000-000000000001' and plan_date='2026-09-02' and status='approved'$$,'%schedule is immutable%','approved plan structure cannot be mutated');
insert into public.focus_sessions(user_id,task_id,status,started_at) values('20000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','active',now());
select throws_ok($$insert into public.focus_sessions(user_id,task_id,status,started_at) values('20000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','active',now())$$,'23505',null,'only one active FocusSession exists per user');
insert into public.domain_commands(user_id,command_type,payload,idempotency_key,correlation_id,status)
values('20000000-0000-0000-0000-000000000001','create_task','{}','command-1','26000000-0000-0000-0000-000000000001','applied');
select throws_ok($$insert into public.domain_commands(user_id,command_type,payload,idempotency_key,correlation_id,status) values('20000000-0000-0000-0000-000000000001','create_task','{}','command-1','26000000-0000-0000-0000-000000000001','applied')$$,'23505',null,'DomainCommand idempotency key prevents duplicate mutation');
insert into public.inbox_items(user_id,source,received_at,dedupe_key,provenance,parse_status,correlation_id)
values('20000000-0000-0000-0000-000000000001','test',now(),'inbox-1','test','pending','26000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.inbox_items(user_id,source,received_at,dedupe_key,provenance,parse_status,correlation_id) values('20000000-0000-0000-0000-000000000001','test',now(),'inbox-1','test','pending','26000000-0000-0000-0000-000000000001')$$,'23505',null,'InboxItem dedupe key prevents duplicate input');
insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload)
values('20000000-0000-0000-0000-000000000001','task_created','task','25000000-0000-0000-0000-000000000001','user',now(),'26000000-0000-0000-0000-000000000001',1,'{}');
select is((select count(*)::integer from public.domain_events where correlation_id='26000000-0000-0000-0000-000000000001'),1,'DomainEvent is queryable by correlation');

insert into public.decisions(id,user_id,question,options,status) values
('27000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','One?','[]','resolved'),
('27000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Two?','[]','resolved');
insert into public.decision_feedback(id,user_id,decision_id,user_choice) values
('28000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','{}');
select throws_like($$insert into public.learning_cases(user_id,case_type,context_snapshot,decision_id,decision_feedback_id,status) values('20000000-0000-0000-0000-000000000001','decision','{}','27000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','open')$$,'%must belong%','LearningCase rejects feedback from another Decision');

insert into public.workflow_runs(id,user_id,workflow_type,status,checkpoint_version,idempotency_key,correlation_id,started_at)
values('29000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approval','waiting',2,'workflow-1','29000000-0000-0000-0000-000000000002',now());
select throws_ok($$insert into public.workflow_runs(user_id,workflow_type,status,checkpoint_version,idempotency_key,correlation_id,started_at) values('20000000-0000-0000-0000-000000000001','approval','waiting',2,'workflow-1','29000000-0000-0000-0000-000000000002',now())$$,'23505',null,'WorkflowRun idempotency key prevents duplicate run');
insert into public.approval_requests(id,user_id,workflow_run_id,action_type,action_ref,action_hash,checkpoint_version,status,requested_at,resume_idempotency_key)
values('29000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','write','task:1','hash-v1',1,'approved',now(),'resume-1');
select is(public.approval_is_resumable('29000000-0000-0000-0000-000000000003','hash-v1',1),false,'stale approval checkpoint cannot resume');
insert into public.notifications(user_id,channel,notification_type,priority,payload,status,attempt_no,dedupe_key)
values('20000000-0000-0000-0000-000000000001','discord','wake','high','{}','scheduled',1,'notification-1');
select throws_ok($$insert into public.notifications(user_id,channel,notification_type,priority,payload,status,attempt_no,dedupe_key) values('20000000-0000-0000-0000-000000000001','discord','wake','high','{}','scheduled',2,'notification-1')$$,'23505',null,'Notification dedupe key prevents duplicate delivery');

insert into public.agent_templates(id,user_id,template_key,version,name,role,instructions,active) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','chief','1','Chief','chief','test',true);
insert into public.agent_instances(id,user_id,agent_template_id,template_version,name,home_scope_id,status) values('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1','Chief','21000000-0000-0000-0000-000000000001','active');
select is((select count(*)::integer from public.agent_scope_grants where agent_instance_id='30000000-0000-0000-0000-000000000002' and scope_id='21000000-0000-0000-0000-000000000003'),0,'Agent has no default access to an ungranted Scope');
insert into public.tool_definitions(id,user_id,tool_key,source_type,read_only,destructive,idempotent,open_world,trust_level,data_access_class,side_effect_class,default_approval_policy,version,active)
values('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','sample','internal',true,false,true,false,'trusted','private','none','never','1',true);
insert into public.tool_grants(user_id,agent_instance_id,tool_definition_id,scope_id,permission,approval_policy,valid_from) values
('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','allow','never',now()),
('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','deny','always',now());
select is(public.effective_tool_permission('30000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001'),'deny','deny ToolGrant wins');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.scopes where user_id='20000000-0000-0000-0000-000000000002'),0,'RLS hides another user row');
reset role;

select * from finish();
rollback;
