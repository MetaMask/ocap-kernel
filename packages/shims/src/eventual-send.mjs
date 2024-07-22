'use strict';
(functors => {

  const cell = (name, value = undefined) => {
    const observers = [];
    return Object.freeze({
      get: Object.freeze(() => {
        return value;
      }),
      set: Object.freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: Object.freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
    {
      makeEnvironmentCaptor: cell("makeEnvironmentCaptor"),
      getEnvironmentOption: cell("getEnvironmentOption"),
      getEnvironmentOptionsList: cell("getEnvironmentOptionsList"),
      environmentOptionsListHas: cell("environmentOptionsListHas"),
    },
    {
    },
    {
      trackTurns: cell("trackTurns"),
    },
    {
      makeMessageBreakpointTester: cell("makeMessageBreakpointTester"),
    },
    {
      getMethodNames: cell("getMethodNames"),
      localApplyFunction: cell("localApplyFunction"),
      localApplyMethod: cell("localApplyMethod"),
      localGet: cell("localGet"),
    },
    {
      makePostponedHandler: cell("makePostponedHandler"),
    },
    {
      makeHandledPromise: cell("makeHandledPromise"),
    },
    {
    },
  ];

  Object.defineProperties(cells[1], Object.getOwnPropertyDescriptors(cells[0]));

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, {
    ...cells,
    // Make this appear like an ESM module namespace object.
    [Symbol.toStringTag]: {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    },
  })));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

function observeImports(map, importName, importIndex) {
  for (const [name, observers] of map.get(importName)) {
    const cell = cells[importIndex][name];
    if (cell === undefined) {
      throw new ReferenceError(`Cannot import name ${name}`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}


  functors[0]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeEnvironmentCaptor: cells[0].makeEnvironmentCaptor.set,
      getEnvironmentOption: cells[0].getEnvironmentOption.set,
      getEnvironmentOptionsList: cells[0].getEnvironmentOptionsList.set,
      environmentOptionsListHas: cells[0].environmentOptionsListHas.set,
    },
    importMeta: {},
  });
  functors[1]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/env-options.js", 0);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[2]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 1);
    },
    liveVar: {
    },
    onceVar: {
      trackTurns: cells[2].trackTurns.set,
    },
    importMeta: {},
  });
  functors[3]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 1);
    },
    liveVar: {
    },
    onceVar: {
      makeMessageBreakpointTester: cells[3].makeMessageBreakpointTester.set,
    },
    importMeta: {},
  });
  functors[4]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./message-breakpoints.js", 3);
    },
    liveVar: {
    },
    onceVar: {
      getMethodNames: cells[4].getMethodNames.set,
      localApplyFunction: cells[4].localApplyFunction.set,
      localApplyMethod: cells[4].localApplyMethod.set,
      localGet: cells[4].localGet.set,
    },
    importMeta: {},
  });
  functors[5]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makePostponedHandler: cells[5].makePostponedHandler.set,
    },
    importMeta: {},
  });
  functors[6]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./track-turns.js", 2);
      observeImports(map, "./local.js", 4);
      observeImports(map, "./postponed.js", 5);
    },
    liveVar: {
    },
    onceVar: {
      makeHandledPromise: cells[6].makeHandledPromise.set,
    },
    importMeta: {},
  });
  functors[7]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/handled-promise.js", 6);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });

  return cells[cells.length - 1]['*'].get();
})([// === functors[0] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   $h‍_imports([]);   /* global globalThis */
/* @ts-check*/

/* `@endo/env-options` needs to be imported quite early, and so should*/
/* avoid importing from ses or anything that depends on ses.*/

/* /////////////////////////////////////////////////////////////////////////////*/
/* Prelude of cheap good - enough imitations of things we'd use or*/
/* do differently if we could depend on ses*/

const{freeze}=Object;
const{apply}=Reflect;

/* Should be equivalent to the one in ses' commons.js even though it*/
/* uses the other technique.*/
const uncurryThis=
(fn)=>
(receiver,...args)=>
apply(fn,receiver,args);
const arrayPush=uncurryThis(Array.prototype.push);
const arrayIncludes=uncurryThis(Array.prototype.includes);
const stringSplit=uncurryThis(String.prototype.split);

const q=JSON.stringify;

const Fail=(literals,...args)=>{
let msg=literals[0];
for(let i=0;i<args.length;i+=1){
msg= `${msg}${args[i]}${literals[i+1]}`;
 }
throw Error(msg);
 };

/* end prelude*/
/* /////////////////////////////////////////////////////////////////////////////*/

/**
 * `makeEnvironmentCaptor` provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {object} aGlobal
 * @param {boolean} [dropNames] Defaults to false. If true, don't track
 * names used.
 */
const        makeEnvironmentCaptor=(aGlobal,dropNames=false)=>{
const capturedEnvironmentOptionNames=[];

/**
 * Gets an environment option by name and returns the option value or the
 * given default.
 *
 * @param {string} optionName
 * @param {string} defaultSetting
 * @param {string[]} [optOtherValues]
 * If provided, the option value must be included or match `defaultSetting`.
 * @returns {string}
 */
const getEnvironmentOption=(
optionName,
defaultSetting,
optOtherValues=undefined)=>
{
typeof optionName==='string'||
Fail `Environment option name ${q(optionName)} must be a string.`;
typeof defaultSetting==='string'||
Fail `Environment option default setting ${q(
defaultSetting)
 } must be a string.`;

/** @type {string} */
let setting=defaultSetting;
const globalProcess=aGlobal.process||undefined;
const globalEnv=
typeof globalProcess==='object'&&globalProcess.env||undefined;
if(typeof globalEnv==='object'){
if(optionName in globalEnv){
if(!dropNames){
arrayPush(capturedEnvironmentOptionNames,optionName);
 }
const optionValue=globalEnv[optionName];
/* eslint-disable-next-line @endo/no-polymorphic-call*/
typeof optionValue==='string'||
Fail `Environment option named ${q(
optionName)
 }, if present, must have a corresponding string value, got ${q(
optionValue)
 }`;
setting=optionValue;
 }
 }
optOtherValues===undefined||
setting===defaultSetting||
arrayIncludes(optOtherValues,setting)||
Fail `Unrecognized ${q(optionName)} value ${q(
setting)
 }. Expected one of ${q([defaultSetting,...optOtherValues])}`;
return setting;
 };
freeze(getEnvironmentOption);

/**
 * @param {string} optionName
 * @returns {string[]}
 */
const getEnvironmentOptionsList=(optionName)=>{
const option=getEnvironmentOption(optionName,'');
return freeze(option===''?[]:stringSplit(option,','));
 };
freeze(getEnvironmentOptionsList);

const environmentOptionsListHas=(optionName,element)=>
arrayIncludes(getEnvironmentOptionsList(optionName),element);

const getCapturedEnvironmentOptionNames=()=>{
return freeze([...capturedEnvironmentOptionNames]);
 };
freeze(getCapturedEnvironmentOptionNames);

return freeze({
getEnvironmentOption,
getEnvironmentOptionsList,
environmentOptionsListHas,
getCapturedEnvironmentOptionNames});

 };$h‍_once.makeEnvironmentCaptor(makeEnvironmentCaptor);
freeze(makeEnvironmentCaptor);

/**
 * For the simple case, where the global in question is `globalThis` and no
 * reporting of option names is desired.
 */
const       {
getEnvironmentOption,
getEnvironmentOptionsList,
environmentOptionsListHas}=
makeEnvironmentCaptor(globalThis,true);$h‍_once.getEnvironmentOption(getEnvironmentOption);$h‍_once.getEnvironmentOptionsList(getEnvironmentOptionsList);$h‍_once.environmentOptionsListHas(environmentOptionsListHas);
})()
,
// === functors[1] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   $h‍_imports([["./src/env-options.js", []]]);   
})()
,
// === functors[2] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   let getEnvironmentOption,environmentOptionsListHas;$h‍_imports([["@endo/env-options", [["getEnvironmentOption", [$h‍_a => (getEnvironmentOption = $h‍_a)]],["environmentOptionsListHas", [$h‍_a => (environmentOptionsListHas = $h‍_a)]]]]]);   





/* NOTE: We can't import these because they're not in scope before lockdown.*/
/* We also cannot currently import them because it would create a cyclic*/
/* dependency, though this is more easily fixed.*/
/* import { assert, X, Fail } from '@endo/errors';*/
/* See also https://github.com/Agoric/agoric-sdk/issues/9515*/

/* WARNING: Global Mutable State!*/
/* This state is communicated to `assert` that makes it available to the*/
/* causal console, which affects the console log output. Normally we*/
/* regard the ability to see console log output as a meta-level privilege*/
/* analogous to the ability to debug. Aside from that, this module should*/
/* not have any observably mutable state.*/

let hiddenPriorError;
let hiddenCurrentTurn=0;
let hiddenCurrentEvent=0;

/* Turn on if you seem to be losing error logging at the top of the event loop*/
const VERBOSE=environmentOptionsListHas('DEBUG','track-turns');

/* Track-turns is disabled by default and can be enabled by an environment*/
/* option.*/
const ENABLED=
getEnvironmentOption('TRACK_TURNS','disabled',['enabled'])==='enabled';

/* We hoist the following functions out of trackTurns() to discourage the*/
/* closures from holding onto 'args' or 'func' longer than necessary,*/
/* which we've seen cause HandledPromise arguments to be retained for*/
/* a surprisingly long time.*/

const addRejectionNote=(detailsNote)=>(reason)=>{
if(reason instanceof Error){
globalThis.assert.note(reason,detailsNote);
 }
if(VERBOSE){
console.log('REJECTED at top of event loop',reason);
 }
 };

const wrapFunction=
(func,sendingError,X)=>
(...args)=>{
hiddenPriorError=sendingError;
hiddenCurrentTurn+=1;
hiddenCurrentEvent=0;
try{
let result;
try{
result=func(...args);
 }catch(err){
if(err instanceof Error){
globalThis.assert.note(
err,
X `Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`);

 }
if(VERBOSE){
console.log('THROWN to top of event loop',err);
 }
throw err;
 }
/* Must capture this now, not when the catch triggers.*/
const detailsNote=X `Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
Promise.resolve(result).catch(addRejectionNote(detailsNote));
return result;
 }finally{
hiddenPriorError=undefined;
 }
 };

/**
 * Given a list of `TurnStarterFn`s, returns a list of `TurnStarterFn`s whose
 * `this`-free call behaviors are not observably different to those that
 * cannot see console output. The only purpose is to cause additional
 * information to appear on the console.
 *
 * The call to `trackTurns` is itself a sending event, that occurs in some call
 * stack in some turn number at some event number within that turn. Each call
 * to any of the returned `TurnStartFn`s is a receiving event that begins a new
 * turn. This sending event caused each of those receiving events.
 *
 * @template {TurnStarterFn[]} T
 * @param {T} funcs
 * @returns {T}
 */
const        trackTurns=(funcs)=>{
if(!ENABLED||typeof globalThis==='undefined'||!globalThis.assert){
return funcs;
 }
const{details:X,note:annotateError}=globalThis.assert;

hiddenCurrentEvent+=1;
const sendingError=Error(
 `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`);

if(hiddenPriorError!==undefined){
annotateError(sendingError,X `Caused by: ${hiddenPriorError}`);
 }

return (/** @type {T} */
funcs.map((func)=>func&&wrapFunction(func,sendingError,X)));

 };

/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 *
 * @typedef {((...args: any[]) => any) | undefined} TurnStarterFn
 */$h‍_once.trackTurns(trackTurns);
})()
,
// === functors[3] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   let getEnvironmentOption;$h‍_imports([["@endo/env-options", [["getEnvironmentOption", [$h‍_a => (getEnvironmentOption = $h‍_a)]]]]]);   

const{quote:q,Fail}=assert;

const{hasOwn,freeze,entries}=Object;

/**
 * @typedef {string | '*'} MatchStringTag
 *   A star `'*'` matches any recipient. Otherwise, the string is
 *   matched against the value of a recipient's `@@toStringTag`
 *   after stripping out any leading `'Alleged: '` or `'DebugName: '`
 *   prefix. For objects defined with `Far` this is the first argument,
 *   known as the `farName`. For exos, this is the tag.
 */
/**
 * @typedef {string | '*'} MatchMethodName
 *   A star `'*'` matches any method name. Otherwise, the string is
 *   matched against the method name. Currently, this is only an exact match.
 *   However, beware that we may introduce a string syntax for
 *   symbol method names.
 */
/**
 * @typedef {number | '*'} MatchCountdown
 *   A star `'*'` will always breakpoint. Otherwise, the string
 *   must be a non-negative integer. Once that is zero, always breakpoint.
 *   Otherwise decrement by one each time it matches until it reaches zero.
 *   In other words, the countdown represents the number of
 *   breakpoint occurrences to skip before actually breakpointing.
 */

/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchStringTag, Record<MatchMethodName, MatchCountdown>>} MessageBreakpoints
 */

/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchMethodName, Record<MatchStringTag, MatchCountdown>>} BreakpointTable
 */

/**
 * @typedef {object} MessageBreakpointTester
 * @property {() => MessageBreakpoints} getBreakpoints
 * @property {(newBreakpoints?: MessageBreakpoints) => void} setBreakpoints
 * @property {(
 *   recipient: object,
 *   methodName: string | symbol | undefined
 * ) => boolean} shouldBreakpoint
 */

/**
 * @param {any} val
 * @returns {val is Record<string, any>}
 */
const isJSONRecord=(val)=>
typeof val==='object'&&val!==null&&!Array.isArray(val);

/**
 * Return `tag` after stripping off any `'Alleged: '` or `'DebugName: '`
 * prefix if present.
 * ```js
 * simplifyTag('Alleged: moola issuer') === 'moola issuer'
 * ```
 * If there are multiple such prefixes, only the outer one is removed.
 *
 * @param {string} tag
 * @returns {string}
 */
const simplifyTag=(tag)=>{
for(const prefix of['Alleged: ','DebugName: ']){
if(tag.startsWith(prefix)){
return tag.slice(prefix.length);
 }
 }
return tag;
 };

/**
 * @param {string} optionName
 * @returns {MessageBreakpointTester | undefined}
 */
const        makeMessageBreakpointTester=(optionName)=>{
let breakpoints=JSON.parse(getEnvironmentOption(optionName,'null'));

if(breakpoints===null){
return undefined;
 }

/** @type {BreakpointTable} */
let breakpointsTable;

const getBreakpoints=()=>breakpoints;
freeze(getBreakpoints);

const setBreakpoints=(newBreakpoints=breakpoints)=>{
isJSONRecord(newBreakpoints)||
Fail `Expected ${q(optionName)} option to be a JSON breakpoints record`;

/** @type {BreakpointTable} */
/* @ts-expect-error confused by __proto__*/
const newBreakpointsTable={__proto__:null};

for(const[tag,methodBPs]of entries(newBreakpoints)){
tag===simplifyTag(tag)||
Fail `Just use simple tag ${q(simplifyTag(tag))} rather than ${q(tag)}`;
isJSONRecord(methodBPs)||
Fail `Expected ${q(optionName)} option's ${q(
tag)
 } to be a JSON methods breakpoints record`;
for(const[methodName,count]of entries(methodBPs)){
count==='*'||
typeof count==='number'&&
Number.isSafeInteger(count)&&
count>=0||
Fail `Expected ${q(optionName)} option's ${q(tag)}.${q(
methodName)
 } to be "*" or a non-negative integer`;

const classBPs=hasOwn(newBreakpointsTable,methodName)?
newBreakpointsTable[methodName]:
newBreakpointsTable[methodName]={
/* @ts-expect-error confused by __proto__*/
__proto__:null};

classBPs[tag]=count;
 }
 }
breakpoints=newBreakpoints;
breakpointsTable=newBreakpointsTable;
 };
freeze(setBreakpoints);

const shouldBreakpoint=(recipient,methodName)=>{
if(methodName===undefined||methodName===null){
/* TODO enable function breakpointing*/
return false;
 }
const classBPs=breakpointsTable[methodName]||breakpointsTable['*'];
if(classBPs===undefined){
return false;
 }
let tag=simplifyTag(recipient[Symbol.toStringTag]);
let count=classBPs[tag];
if(count===undefined){
tag='*';
count=classBPs[tag];
if(count===undefined){
return false;
 }
 }
if(count==='*'){
return true;
 }
if(count===0){
return true;
 }
assert(typeof count==='number'&&count>=1);
classBPs[tag]=count-1;
return false;
 };
freeze(shouldBreakpoint);

const breakpointTester=freeze({
getBreakpoints,
setBreakpoints,
shouldBreakpoint});

breakpointTester.setBreakpoints();
return breakpointTester;
 };$h‍_once.makeMessageBreakpointTester(makeMessageBreakpointTester);
freeze(makeMessageBreakpointTester);
})()
,
// === functors[4] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   let makeMessageBreakpointTester;$h‍_imports([["./message-breakpoints.js", [["makeMessageBreakpointTester", [$h‍_a => (makeMessageBreakpointTester = $h‍_a)]]]]]);   

const{details:X,quote:q,Fail}=assert;

const{getOwnPropertyDescriptors,getPrototypeOf,freeze}=Object;
const{apply,ownKeys}=Reflect;

const ntypeof=(specimen)=>specimen===null?'null':typeof specimen;

const onDelivery=makeMessageBreakpointTester('ENDO_DELIVERY_BREAKPOINTS');

/**
 * TODO Consolidate with `isObject` that's currently in `@endo/marshal`
 *
 * @param {any} val
 * @returns {boolean}
 */
const isObject=(val)=>Object(val)===val;

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified=(a,b)=>{
if(typeof a===typeof b){
const left=String(a);
const right=String(b);
/* eslint-disable-next-line no-nested-ternary*/
return left<right?-1:left>right?1:0;
 }
if(typeof a==='symbol'){
assert(typeof b==='string');
return-1;
 }
assert(typeof a==='string');
assert(typeof b==='symbol');
return 1;
 };

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
const        getMethodNames=(val)=>{
let layer=val;
const names=new Set();/* Set to deduplicate*/
while(layer!==null&&layer!==Object.prototype){
/* be tolerant of non-objects*/
const descs=getOwnPropertyDescriptors(layer);
for(const name of ownKeys(descs)){
/* In case a method is overridden by a non-method,*/
/* test `val[name]` rather than `layer[name]`*/
if(typeof val[name]==='function'){
names.add(name);
 }
 }
if(!isObject(val)){
break;
 }
layer=getPrototypeOf(layer);
 }
return harden([...names].sort(compareStringified));
 };
/* The top level of the eventual send modules can be evaluated before*/
/* ses creates `harden`, and so cannot rely on `harden` at top level.*/$h‍_once.getMethodNames(getMethodNames);
freeze(getMethodNames);

const        localApplyFunction=(recipient,args)=>{
typeof recipient==='function'||
assert.fail(
X `Cannot invoke target as a function; typeof target is ${q(
ntypeof(recipient))
 }`,
TypeError);

if(onDelivery&&onDelivery.shouldBreakpoint(recipient,undefined)){
/* eslint-disable-next-line no-debugger*/
debugger;/* STEP INTO APPLY*/
/* Stopped at a breakpoint on this delivery of an eventual function call*/
/* so that you can step *into* the following `apply` in order to see the*/
/* function call as it happens. Or step *over* to see what happens*/
/* after the function call returns.*/
 }
const result=apply(recipient,undefined,args);
return result;
 };$h‍_once.localApplyFunction(localApplyFunction);

const        localApplyMethod=(recipient,methodName,args)=>{
if(methodName===undefined||methodName===null){
/* Base case; bottom out to apply functions.*/
return localApplyFunction(recipient,args);
 }
if(recipient===undefined||recipient===null){
assert.fail(
X `Cannot deliver ${q(methodName)} to target; typeof target is ${q(
ntypeof(recipient))
 }`,
TypeError);

 }
const fn=recipient[methodName];
if(fn===undefined){
assert.fail(
X `target has no method ${q(methodName)}, has ${q(
getMethodNames(recipient))
 }`,
TypeError);

 }
const ftype=ntypeof(fn);
typeof fn==='function'||
Fail `invoked method ${q(methodName)} is not a function; it is a ${q(
ftype)
 }`;
if(onDelivery&&onDelivery.shouldBreakpoint(recipient,methodName)){
/* eslint-disable-next-line no-debugger*/
debugger;/* STEP INTO APPLY*/
/* Stopped at a breakpoint on this delivery of an eventual method call*/
/* so that you can step *into* the following `apply` in order to see the*/
/* method call as it happens. Or step *over* to see what happens*/
/* after the method call returns.*/
 }
const result=apply(fn,recipient,args);
return result;
 };$h‍_once.localApplyMethod(localApplyMethod);

const        localGet=(t,key)=>t[key];$h‍_once.localGet(localGet);
})()
,
// === functors[5] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   $h‍_imports([]);   /*/ <reference types="ses" />*/

/**
 * Create a simple postponedHandler that just postpones until donePostponing is
 * called.
 *
 * @param {IMPORT('./types').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<IMPORT('./types').Handler<any>>, () => void]} postponedHandler and donePostponing callback.
 */
const        makePostponedHandler=(HandledPromise)=>{
/** @type {() => void} */
let donePostponing;

const interlockP=new Promise((resolve)=>{
donePostponing=()=>resolve(undefined);
 });

const makePostponedOperation=(postponedOperation)=>{
/* Just wait until the handler is resolved/rejected.*/
return function postpone(x,...args){
/* console.log(`forwarding ${postponedOperation} ${args[0]}`);*/
return new HandledPromise((resolve,reject)=>{
interlockP.
then((_)=>{
resolve(HandledPromise[postponedOperation](x,...args));
 }).
catch(reject);
 });
 };
 };

/** @type {Required<IMPORT('./types').Handler<any>>} */
const postponedHandler={
get:makePostponedOperation('get'),
getSendOnly:makePostponedOperation('getSendOnly'),
applyFunction:makePostponedOperation('applyFunction'),
applyFunctionSendOnly:makePostponedOperation('applyFunctionSendOnly'),
applyMethod:makePostponedOperation('applyMethod'),
applyMethodSendOnly:makePostponedOperation('applyMethodSendOnly')};


/* @ts-expect-error 2454*/
assert(donePostponing);

return[postponedHandler,donePostponing];
 };$h‍_once.makePostponedHandler(makePostponedHandler);
})()
,
// === functors[6] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   let trackTurns,localApplyFunction,localApplyMethod,localGet,getMethodNames,makePostponedHandler;$h‍_imports([["./track-turns.js", [["trackTurns", [$h‍_a => (trackTurns = $h‍_a)]]]],["./local.js", [["localApplyFunction", [$h‍_a => (localApplyFunction = $h‍_a)]],["localApplyMethod", [$h‍_a => (localApplyMethod = $h‍_a)]],["localGet", [$h‍_a => (localGet = $h‍_a)]],["getMethodNames", [$h‍_a => (getMethodNames = $h‍_a)]]]],["./postponed.js", [["makePostponedHandler", [$h‍_a => (makePostponedHandler = $h‍_a)]]]]]);   










const{Fail,details:X,quote:q,note:annotateError}=assert;

const{
create,
freeze,
getOwnPropertyDescriptor,
getOwnPropertyDescriptors,
defineProperties,
getPrototypeOf,
setPrototypeOf,
isFrozen,
is:objectIs}=
Object;

const{apply,construct,ownKeys}=Reflect;

const SEND_ONLY_RE=/^(.*)SendOnly$/;

/**
 * Coerce to an object property (string or symbol).
 *
 * @param {any} specimen
 * @returns {string | symbol}
 */
const coerceToObjectProperty=(specimen)=>{
if(typeof specimen==='symbol'){
return specimen;
 }
return String(specimen);
 };

/* the following method (makeHandledPromise) is part*/
/* of the shim, and will not be exported by the module once the feature*/
/* becomes a part of standard javascript*/

/**
 * Create a HandledPromise class to have it support eventual send
 * (wavy-dot) operations.
 *
 * Based heavily on nanoq
 * https://github.com/drses/nanoq/blob/master/src/nanoq.js
 *
 * Original spec for the infix-bang (predecessor to wavy-dot) desugaring:
 * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
 *
 */
const        makeHandledPromise=()=>{
const presenceToHandler=new WeakMap();
/** @type {WeakMap<any, any>} */
const presenceToPromise=new WeakMap();
const promiseToPendingHandler=new WeakMap();
const promiseToPresence=new WeakMap();
const forwardedPromiseToPromise=new WeakMap();/* forwarding, union-find-ish*/

/**
 * You can imagine a forest of trees in which the roots of each tree is an
 * unresolved HandledPromise or a non-Promise, and each node's parent is the
 * HandledPromise to which it was forwarded.  We maintain that mapping of
 * forwarded HandledPromise to its resolution in forwardedPromiseToPromise.
 *
 * We use something like the description of "Find" with "Path splitting"
 * to propagate changes down to the children efficiently:
 * https://en.wikipedia.org/wiki/Disjoint-set_data_structure
 *
 * @param {any} target Any value.
 * @returns {any} If the target was a HandledPromise, the most-resolved parent
 * of it, otherwise the target.
 */
const shorten=(target)=>{
let p=target;
/* Find the most-resolved value for p.*/
while(forwardedPromiseToPromise.has(p)){
p=forwardedPromiseToPromise.get(p);
 }
const presence=promiseToPresence.get(p);
if(presence){
/* Presences are final, so it is ok to propagate*/
/* this upstream.*/
while(!objectIs(target,p)){
const parent=forwardedPromiseToPromise.get(target);
forwardedPromiseToPromise.delete(target);
promiseToPendingHandler.delete(target);
promiseToPresence.set(target,presence);
target=parent;
 }
 }else{
/* We propagate p and remove all other pending handlers*/
/* upstream.*/
/* Note that everything except presences is covered here.*/
while(!objectIs(target,p)){
const parent=forwardedPromiseToPromise.get(target);
forwardedPromiseToPromise.set(target,p);
promiseToPendingHandler.delete(target);
target=parent;
 }
 }
return target;
 };

/**
 * This special handler accepts Promises, and forwards
 * handled Promises to their corresponding fulfilledHandler.
 *
 * @type {Required<Handler<any>>}
 */
let forwardingHandler;
let handle;

/**
 * @param {string} handlerName
 * @param {Handler<any>} handler
 * @param {string} operation
 * @param {any} o
 * @param {any[]} opArgs
 * @param {Promise<unknown>} [returnedP]
 * @returns {any}
 */
const dispatchToHandler=(
handlerName,
handler,
operation,
o,
opArgs,
returnedP)=>
{
let actualOp=operation;

const matchSendOnly=SEND_ONLY_RE.exec(actualOp);

const makeResult=(result)=>matchSendOnly?undefined:result;

if(matchSendOnly){
/* We don't specify the resulting promise if it is sendonly.*/
returnedP=undefined;
 }

if(matchSendOnly&&typeof handler[actualOp]!=='function'){
/* Substitute for sendonly with the corresponding non-sendonly operation.*/
actualOp=matchSendOnly[1];
 }

/* Fast path: just call the actual operation.*/
const hfn=handler[actualOp];
if(typeof hfn==='function'){
const result=apply(hfn,handler,[o,...opArgs,returnedP]);
return makeResult(result);
 }

if(actualOp==='applyMethod'){
/* Compose a missing applyMethod by get followed by applyFunction.*/
const[prop,args]=opArgs;
const getResultP=handle(
o,
'get',
/* The argument to 'get' is a string or symbol.*/
[coerceToObjectProperty(prop)],
undefined);

return makeResult(handle(getResultP,'applyFunction',[args],returnedP));
 }

/* BASE CASE: applyFunction bottoms out into applyMethod, if it exists.*/
if(actualOp==='applyFunction'){
const amfn=handler.applyMethod;
if(typeof amfn==='function'){
/* Downlevel a missing applyFunction to applyMethod with undefined name.*/
const[args]=opArgs;
const result=apply(amfn,handler,[o,undefined,[args],returnedP]);
return makeResult(result);
 }
 }

throw assert.fail(
X `${q(handlerName)} is defined but has no methods needed for ${q(
operation)
 } (has ${q(getMethodNames(handler))})`,
TypeError);

 };

/** @typedef {{new <R>(executor: HandledExecutor<R>, unfulfilledHandler?: Handler<Promise<unknown>>): Promise<R>, prototype: Promise<unknown>} & PromiseConstructor & HandledPromiseStaticMethods} HandledPromiseConstructor */
/** @type {HandledPromiseConstructor} */
let HandledPromise;

/**
 * This *needs* to be a `function X` so that we can use it as a constructor.
 *
 * @template R
 * @param {HandledExecutor<R>} executor
 * @param {Handler<Promise<R>>} [pendingHandler]
 * @returns {Promise<R>}
 */
function baseHandledPromise(executor,pendingHandler=undefined){
new.target||Fail `must be invoked with "new"`;
let handledResolve;
let handledReject;
let resolved=false;
let resolvedTarget=null;
let handledP;
let continueForwarding=()=>{ };
const assertNotYetForwarded=()=>{
!forwardedPromiseToPromise.has(handledP)||
assert.fail(X `internal: already forwarded`,TypeError);
 };
const superExecutor=(superResolve,superReject)=>{
handledResolve=(value)=>{
if(resolved){
return;
 }
assertNotYetForwarded();
value=shorten(value);
let targetP;
if(
promiseToPendingHandler.has(value)||
promiseToPresence.has(value))
{
targetP=value;
 }else{
/* We're resolving to a non-promise, so remove our handler.*/
promiseToPendingHandler.delete(handledP);
targetP=presenceToPromise.get(value);
 }
/* Ensure our data structure is a proper tree (avoid cycles).*/
if(targetP&&!objectIs(targetP,handledP)){
forwardedPromiseToPromise.set(handledP,targetP);
 }else{
forwardedPromiseToPromise.delete(handledP);
 }

/* Remove stale pending handlers, set to canonical form.*/
shorten(handledP);

/* Finish the resolution.*/
superResolve(value);
resolved=true;
resolvedTarget=value;

/* We're resolved, so forward any postponed operations to us.*/
continueForwarding();
 };
handledReject=(reason)=>{
if(resolved){
return;
 }
harden(reason);
assertNotYetForwarded();
promiseToPendingHandler.delete(handledP);
resolved=true;
superReject(reason);
continueForwarding();
 };
 };
handledP=harden(construct(Promise,[superExecutor],new.target));

if(!pendingHandler){
/* This is insufficient for actual remote handled Promises*/
/* (too many round-trips), but is an easy way to create a*/
/* local handled Promise.*/
[pendingHandler,continueForwarding]=
makePostponedHandler(HandledPromise);
 }

const validateHandler=(h)=>{
Object(h)===h||
assert.fail(X `Handler ${h} cannot be a primitive`,TypeError);
 };
validateHandler(pendingHandler);

/* Until the handled promise is resolved, we use the pendingHandler.*/
promiseToPendingHandler.set(handledP,pendingHandler);

const rejectHandled=(reason)=>{
if(resolved){
return;
 }
assertNotYetForwarded();
handledReject(reason);
 };

const resolveWithPresence=(
presenceHandler=pendingHandler,
options={})=>
{
if(resolved){
return resolvedTarget;
 }
assertNotYetForwarded();
try{
/* Sanity checks.*/
validateHandler(presenceHandler);

const{proxy:proxyOpts}=options;
let presence;
if(proxyOpts){
const{
handler:proxyHandler,
target:proxyTarget,
revokerCallback}=
proxyOpts;
if(revokerCallback){
/* Create a proxy and its revoke function.*/
const{proxy,revoke}=Proxy.revocable(
proxyTarget,
proxyHandler);

presence=proxy;
revokerCallback(revoke);
 }else{
presence=new Proxy(proxyTarget,proxyHandler);
 }
 }else{
/* Default presence.*/
presence=create(null);
 }

/* Validate and install our mapped target (i.e. presence).*/
resolvedTarget=presence;

/* Create table entries for the presence mapped to the*/
/* fulfilledHandler.*/
presenceToPromise.set(resolvedTarget,handledP);
promiseToPresence.set(handledP,resolvedTarget);
presenceToHandler.set(resolvedTarget,presenceHandler);

/* We committed to this presence, so resolve.*/
handledResolve(resolvedTarget);
return resolvedTarget;
 }catch(e){
annotateError(e,X `during resolveWithPresence`);
handledReject(e);
throw e;
 }
 };

const resolveHandled=(target)=>{
if(resolved){
return;
 }
assertNotYetForwarded();
try{
/* Resolve the target.*/
handledResolve(target);
 }catch(e){
handledReject(e);
 }
 };

/* Invoke the callback to let the user resolve/reject.*/
executor(resolveHandled,rejectHandled,resolveWithPresence);

return handledP;
 }

/**
 * If the promise `p` is safe, then during the evaluation of the
 * expressopns `p.then` and `await p`, `p` cannot mount a reentrancy attack.
 * Unfortunately, due to limitations of the current JavaScript standard,
 * it seems impossible to prevent `p` from mounting a reentrancy attack
 * during the evaluation of `isSafePromise(p)`, and therefore during
 * operations like `HandledPromise.resolve(p)` that call
 * `isSafePromise(p)` synchronously.
 *
 * The `@endo/marshal` package defines a related notion of a passable
 * promise, i.e., one for which which `passStyleOf(p) === 'promise'`. All
 * passable promises are also safe. But not vice versa because the
 * requirements for a promise to be passable are slightly greater. A safe
 * promise must not override `then` or `constructor`. A passable promise
 * must not have any own properties. The requirements are otherwise
 * identical.
 *
 * @param {Promise} p
 * @returns {boolean}
 */
const isSafePromise=(p)=>{
return(
isFrozen(p)&&
getPrototypeOf(p)===Promise.prototype&&
Promise.resolve(p)===p&&
getOwnPropertyDescriptor(p,'then')===undefined&&
getOwnPropertyDescriptor(p,'constructor')===undefined);

 };

/** @type {HandledPromiseStaticMethods & Pick<PromiseConstructor, 'resolve'>} */
const staticMethods={
get(target,prop){
prop=coerceToObjectProperty(prop);
return handle(target,'get',[prop]);
 },
getSendOnly(target,prop){
prop=coerceToObjectProperty(prop);
handle(target,'getSendOnly',[prop]).catch(()=>{ });
 },
applyFunction(target,args){
/* Ensure args is an array.*/
args=[...args];
return handle(target,'applyFunction',[args]);
 },
applyFunctionSendOnly(target,args){
/* Ensure args is an array.*/
args=[...args];
handle(target,'applyFunctionSendOnly',[args]).catch(()=>{ });
 },
applyMethod(target,prop,args){
prop=coerceToObjectProperty(prop);
/* Ensure args is an array.*/
args=[...args];
return handle(target,'applyMethod',[prop,args]);
 },
applyMethodSendOnly(target,prop,args){
prop=coerceToObjectProperty(prop);
/* Ensure args is an array.*/
args=[...args];
handle(target,'applyMethodSendOnly',[prop,args]).catch(()=>{ });
 },
resolve(value){
/* Resolving a Presence returns the pre-registered handled promise.*/
let resolvedPromise=presenceToPromise.get(/** @type {any} */value);
if(!resolvedPromise){
resolvedPromise=Promise.resolve(value);
 }
/* Prevent any proxy trickery.*/
harden(resolvedPromise);
if(isSafePromise(resolvedPromise)){
/* We can use the `resolvedPromise` directly, since it is guaranteed to*/
/* have a `then` which is actually `Promise.prototype.then`.*/
return resolvedPromise;
 }
/* Assimilate the `resolvedPromise` as an actual frozen Promise, by*/
/* treating `resolvedPromise` as if it is a non-promise thenable.*/
const executeThen=(resolve,reject)=>
resolvedPromise.then(resolve,reject);
return harden(
Promise.resolve().then(()=>new HandledPromise(executeThen)));

 }};


const makeForwarder=(operation,localImpl)=>{
return(o,...args)=>{
/* We are in another turn already, and have the naked object.*/
const presenceHandler=presenceToHandler.get(o);
if(!presenceHandler){
return localImpl(o,...args);
 }
return dispatchToHandler(
'presenceHandler',
presenceHandler,
operation,
o,
args);

 };
 };

/* eslint-disable-next-line prefer-const*/
forwardingHandler={
get:makeForwarder('get',localGet),
getSendOnly:makeForwarder('getSendOnly',localGet),
applyFunction:makeForwarder('applyFunction',localApplyFunction),
applyFunctionSendOnly:makeForwarder(
'applyFunctionSendOnly',
localApplyFunction),

applyMethod:makeForwarder('applyMethod',localApplyMethod),
applyMethodSendOnly:makeForwarder('applyMethodSendOnly',localApplyMethod)};


handle=(...handleArgs)=>{
/* We're in SES mode, so we should harden.*/
harden(handleArgs);
const[_p,operation,opArgs,...dispatchArgs]=handleArgs;
let[p]=handleArgs;
const doDispatch=(handlerName,handler,o)=>
dispatchToHandler(
handlerName,
handler,
operation,
o,
opArgs,
/* eslint-disable-next-line no-use-before-define*/
...(dispatchArgs.length===0?[returnedP]:dispatchArgs));

const[trackedDoDispatch]=trackTurns([doDispatch]);
const returnedP=new HandledPromise((resolve,reject)=>{
/* We run in a future turn to prevent synchronous attacks,*/
let raceIsOver=false;

const win=(handlerName,handler,o)=>{
if(raceIsOver){
return;
 }
try{
resolve(harden(trackedDoDispatch(handlerName,handler,o)));
 }catch(reason){
reject(harden(reason));
 }
raceIsOver=true;
 };

const lose=(reason)=>{
if(raceIsOver){
return;
 }
reject(harden(reason));
raceIsOver=true;
 };

/* This contestant tries to win with the target's resolution.*/
staticMethods.
resolve(p).
then((o)=>win('forwardingHandler',forwardingHandler,o)).
catch(lose);

/* This contestant sleeps a turn, but then tries to win immediately.*/
staticMethods.
resolve().
then(()=>{
p=shorten(p);
const pendingHandler=promiseToPendingHandler.get(p);
if(pendingHandler){
/* resolve to the answer from the specific pending handler,*/
win('pendingHandler',pendingHandler,p);
 }else if(!p||typeof p.then!=='function'){
/* Not a Thenable, so use it.*/
win('forwardingHandler',forwardingHandler,p);
 }else if(promiseToPresence.has(p)){
/* We have the object synchronously, so resolve with it.*/
const o=promiseToPresence.get(p);
win('forwardingHandler',forwardingHandler,o);
 }
/* If we made it here without winning, then we will wait*/
/* for the other contestant to win instead.*/
 }).
catch(lose);
 });

/* We return a handled promise with the default pending handler.  This*/
/* prevents a race between the above Promise.resolves and pipelining.*/
return harden(returnedP);
 };

/* Add everything needed on the constructor.*/
baseHandledPromise.prototype=Promise.prototype;
setPrototypeOf(baseHandledPromise,Promise);
defineProperties(
baseHandledPromise,
getOwnPropertyDescriptors(staticMethods));


/* FIXME: This is really ugly to bypass the type system, but it will be better*/
/* once we use Promise.delegated and don't have any [[Constructor]] behaviours.*/
/* @ts-expect-error cast*/
HandledPromise=baseHandledPromise;

/* We're a vetted shim which runs before `lockdown` allows*/
/* `harden(HandledPromise)` to function, but single-level `freeze` is a*/
/* suitable replacement because all mutable objects reachable afterwards are*/
/* intrinsics hardened by lockdown.*/
freeze(HandledPromise);
for(const key of ownKeys(HandledPromise)){
/* prototype is the intrinsic Promise.prototype to be hardened by lockdown.*/
if(key!=='prototype'){
freeze(HandledPromise[key]);
 }
 }

return HandledPromise;
 };

/**
 * @template T
 * @typedef {{
 *   get?(p: T, name: PropertyKey, returnedP?: Promise<unknown>): unknown;
 *   getSendOnly?(p: T, name: PropertyKey): void;
 *   applyFunction?(p: T, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyFunctionSendOnly?(p: T, args: unknown[]): void;
 *   applyMethod?(p: T, name: PropertyKey | undefined, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyMethodSendOnly?(p: T, name: PropertyKey | undefined, args: unknown[]): void;
 * }} Handler
 */

/**
 * @template {{}} T
 * @typedef {{
 *   proxy?: {
 *     handler: ProxyHandler<T>;
 *     target: unknown;
 *     revokerCallback?(revoker: () => void): void;
 *   };
 * }} ResolveWithPresenceOptionsBag
 */

/**
 * @template [R = unknown]
 * @typedef {(
 *   resolveHandled: (value?: R) => void,
 *   rejectHandled: (reason?: unknown) => void,
 *   resolveWithPresence: (presenceHandler: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>) => object,
 * ) => void} HandledExecutor
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   resolve(value?: R): void;
 *   reject(reason: unknown): void;
 *   resolveWithPresence(presenceHandler?: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>): object;
 * }} Settler
 */

/**
 * @typedef {{
 *   applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
 *   applyFunctionSendOnly(target: unknown, args: unknown[]): void;
 *   applyMethod(target: unknown, prop: PropertyKey | undefined, args: unknown[]): Promise<unknown>;
 *   applyMethodSendOnly(target: unknown, prop: PropertyKey, args: unknown[]): void;
 *   get(target: unknown, prop: PropertyKey): Promise<unknown>;
 *   getSendOnly(target: unknown, prop: PropertyKey): void;
 * }} HandledPromiseStaticMethods
 */

/** @typedef {ReturnType<typeof makeHandledPromise>} HandledPromiseConstructor */$h‍_once.makeHandledPromise(makeHandledPromise);
})()
,
// === functors[7] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () { 'use strict';   let makeHandledPromise;$h‍_imports([["./src/handled-promise.js", [["makeHandledPromise", [$h‍_a => (makeHandledPromise = $h‍_a)]]]]]);   


if(typeof globalThis.HandledPromise==='undefined'){
globalThis.HandledPromise=makeHandledPromise();
 }
})()
,
]);

