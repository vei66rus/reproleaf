import {z} from 'zod';
const selector=z.string().min(1).max(500);
const size=z.object({width:z.number().int().min(240).max(4096),height:z.number().int().min(240).max(4096)}).strict();
const control=z.object({id:z.string().max(80),type:z.literal('control'),selector}).strict();
const overflow=z.object({id:z.string().max(80),type:z.literal('document-overflow'),intentionalHorizontalScroll:z.boolean().optional()}).strict();
const canvas=z.object({id:z.string().max(80),type:z.literal('canvas-coverage'),selector,host:selector,renderScale:z.number().min(.25).max(4).optional()}).strict();
const reading=z.object({id:z.string().max(80),type:z.literal('readable-tail'),selector,tail:selector,close:selector}).strict();
const focusOcclusion=z.object({id:z.string().max(80),type:z.literal('focus-occlusion'),selector}).strict();
export const adapterSchema=z.object({schemaVersion:z.literal(1),url:z.string().url().max(2048),viewport:size,steps:z.array(z.discriminatedUnion('action',[
 z.object({action:z.literal('click'),selector}).strict(),
 z.object({action:z.literal('focus'),selector}).strict(),
 z.object({action:z.literal('scroll'),selector,edge:z.enum(['start','end'])}).strict(),
 z.object({action:z.literal('resize'),...size.shape}).strict(),
 z.object({action:z.literal('waitFor'),selector}).strict()
])).max(20).default([]),checks:z.array(z.discriminatedUnion('type',[control,overflow,canvas,reading,focusOcclusion])).min(1).max(40)}).strict();
