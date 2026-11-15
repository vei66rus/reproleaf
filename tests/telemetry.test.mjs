import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetryRecorder,recordAuditEvent,getTelemetrySummary} from '../src/telemetry.mjs';

test('telemetry recorder is opt-in and records zero events when disabled',()=>{
 const rec=createTelemetryRecorder({enabled:false});
 const recorded=recordAuditEvent(rec,{tool:'audit_html_document',ok:true,errors:0,warnings:1});
 assert.equal(recorded,false);
 assert.equal(getTelemetrySummary(rec).totals.runs,0);
});

test('telemetry recorder aggregates safe counters and rejects unknown PII fields',()=>{
 const rec=createTelemetryRecorder({enabled:true});
 assert.throws(()=>recordAuditEvent(rec,{tool:'audit_html_document',ok:true,url:'https://secret.example'}));
 const ok=recordAuditEvent(rec,{tool:'audit_html_document',ok:false,errors:2,warnings:1});
 assert.equal(ok,true);
 const summary=getTelemetrySummary(rec);
 assert.equal(summary.totals.runs,1);
 assert.equal(summary.totals.failed,1);
 assert.equal(summary.byTool.audit_html_document.errors,2);
});
