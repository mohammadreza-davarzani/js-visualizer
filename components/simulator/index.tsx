// ✅ Enhanced to respect setTimeout delays at execution time and pause on call stack entry
"use client";

import { Button, Card, Textarea } from "@/components/ui";
import * as acorn from "acorn";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import AnimatedArrow from "../animated-arrow";

interface ExecutionContext {
  id: string;
  name: string;
  delay?: number;
  createdAt?: number;
  movingFrom?: string;
  movingTo?: string;
}

export default function SimulatorV5() {
  const [code, setCode] = useState<string>(
    `setTimeout(function a() {}, 1000);
setTimeout(function b() {}, 500);
setTimeout(function c() {}, 0);

function d() {
  setTimeout(function a() {}, 1000);
  setTimeout(function b() {}, 500);
  setTimeout(function c() {}, 0);
}

d();`
  );

  const [callStack, setCallStack] = useState<ExecutionContext[]>([]);
  const [taskQueue, setTaskQueue] = useState<ExecutionContext[]>([]);
  const [microtaskQueue, setMicrotaskQueue] = useState<ExecutionContext[]>([]);
  const [arrow, setArrow] = useState<{ from: string; to: string } | null>(null);
  const [timeline, setTimeline] = useState<string[]>([]);
  const tickRef = useRef<number>(1);
  const stepsRef = useRef<any[]>([]);
  const stepIndexRef = useRef<number>(-1);
  const functionMapRef = useRef<Record<string, any>>({});
  const simulationStartRef = useRef<number>(Date.now());

  const genId = () => String(Math.random()).slice(2, 10);

  const resetAll = () => {
    setCallStack([]);
    setTaskQueue([]);
    setMicrotaskQueue([]);
    setArrow(null);
    setTimeline([]);
    tickRef.current = 1;
    stepsRef.current = [];
    stepIndexRef.current = -1;
    functionMapRef.current = {};
    simulationStartRef.current = Date.now();

    const ast = acorn.parse(code, { ecmaVersion: 2020 }) as any;
    const newSteps: any[] = [];

    ast.body.forEach((node: any) => {
      if (node.type === "FunctionDeclaration" && node.id?.name) {
        functionMapRef.current[node.id.name] = node.body;
      }
    });

    ast.body.forEach((stmt: any) => walkAST(stmt, newSteps));

    // Add event loop steps to process microtasks after Promise creation
    for (let i = 0; i < 50; i++) {
      newSteps.push({ type: "eventLoop" });
    }

    stepsRef.current = newSteps;
  };

  const walkAST = (node: any, steps: any[]) => {
    if (!node) return;

    if (node.type === "ExpressionStatement") {
      walkAST(node.expression, steps);
    } else if (node.type === "CallExpression") {
      const callee = node.callee;

      // Handle .then() and .catch() calls on Promises
      if (callee.type === "MemberExpression" &&
          (callee.property?.name === "then" || callee.property?.name === "catch")) {
        const callback = node.arguments[0];
        if (callback) {
          const funcName = callback.id?.name || `${callee.property.name}()`;
          const id = genId();
          const createdAt = Date.now() - simulationStartRef.current;

          steps.push({
            type: "enqueue",
            queue: "microtaskQueue",
            item: { name: funcName, id, createdAt },
          });
        }
        return; // Don't process further for Promise methods
      }

      const calleeName = callee.name || (callee.type === "Identifier" ? callee.name : "anonymous()");
      const id = genId();

      if (calleeName === "setTimeout") {
        const func = node.arguments[0];
        const delayNode = node.arguments[1];
        const delay = delayNode?.value || 0;
        const funcName = func.id?.name || (func.type === "FunctionExpression" ? "setTimeout()" : "anonymous");
        const createdAt = Date.now() - simulationStartRef.current;

        steps.push({
          type: "enqueue",
          queue: "taskQueue",
          item: { name: funcName, id, delay, createdAt },
        });

        // Don't process setTimeout body here - it will be processed when the task executes
      } else if (calleeName === "fetch" || calleeName === "Promise") {
        // Handle Promise creation - these return immediately and don't block
        // The actual Promise callbacks (.then/.catch) are handled separately
        steps.push({ type: "call", fn: calleeName, id });
        steps.push({ type: "return", id });

        // Don't process arguments for fetch/Promise - the callbacks are handled by MemberExpression
        return;
      } else {
        steps.push({ type: "call", fn: calleeName, id });
        const functionBody = functionMapRef.current[calleeName];
        if (functionBody && functionBody.body) {
          functionBody.body.forEach((stmt: any) => walkAST(stmt, steps));
        }
        steps.push({ type: "return", id });
      }
    } else if (node.type === "MemberExpression") {
      // Handle .then() and .catch() calls
      const property = node.property;

      if (property?.name === "then" || property?.name === "catch") {
        // Check if this MemberExpression is part of a CallExpression
        if (node.parent && node.parent.type === "CallExpression") {
          const callback = node.parent.arguments[0];
          if (callback) {
            const funcName = callback.id?.name || `${property.name}()`;
            const id = genId();
            const createdAt = Date.now() - simulationStartRef.current;

            steps.push({
              type: "enqueue",
              queue: "microtaskQueue",
              item: { name: funcName, id, createdAt },
            });
          }
        }
      }
    }
  };

  const applyStep = (step: any) => {
    if (!step) return;

    if (step.type === "enqueue") {
      if (step.queue === "taskQueue") {
        setTaskQueue((prev) => [...prev, step.item]);
      } else if (step.queue === "microtaskQueue") {
        setMicrotaskQueue((prev) => [...prev, step.item]);
      }
    } else if (step.type === "call") {
      setCallStack((prev) => [...prev, { name: step.fn, id: step.id }]);
    } else if (step.type === "return") {
      setCallStack((prev) => prev.filter((ctx) => ctx.id !== step.id));
    } else if (step.type === "eventLoop") {
      if (microtaskQueue.length > 0) {
        const job = microtaskQueue[0];
        setArrow({ from: "microtask", to: "stack" });
        setTimeout(() => setArrow(null), 400);
        setMicrotaskQueue((prev) => prev.slice(1));
        setCallStack((prev) => [...prev, job]);
        setTimeline((prev) => [
          ...prev,
          `Tick ${tickRef.current++}: Executed Microtask → ${job.name}`,
        ]);
        // Remove from call stack after a short delay
        setTimeout(() => {
          setCallStack((prev) => prev.filter((ctx) => ctx.id !== job.id));
        }, 500);
        return;
      }
      const now = Date.now() - simulationStartRef.current;
      const availableTasks = taskQueue.filter((job) => (job.delay ?? 0) <= now);
      if (availableTasks.length > 0) {
        // Sort by delay first, then by creation time for FIFO within same delay
        const sortedTasks = availableTasks.sort((a, b) => {
          if (a.delay !== b.delay) {
            return (a.delay ?? 0) - (b.delay ?? 0);
          }
          return (a.createdAt ?? 0) - (b.createdAt ?? 0);
        });
        const job = sortedTasks[0];
        setArrow({ from: "task", to: "stack" });
        setTimeout(() => setArrow(null), 400);
        setTaskQueue((prev) => prev.filter((j) => j.id !== job.id));
        setCallStack((prev) => [...prev, job]);

        // Process the setTimeout function body to add new tasks
        if (job.name === "setTimeout()") {
          // Find the setTimeout call in the AST and process its function body
          const ast = acorn.parse(code, { ecmaVersion: 2020 }) as any;

          const processSetTimeoutBody = (node: any) => {
            if (!node) return;
            if (node.type === "CallExpression" && node.callee?.name === "setTimeout") {
              const func = node.arguments[0];
              const delayNode = node.arguments[1];
              const delay = delayNode?.value || 0;
              const funcName = func.id?.name || "setTimeout()";
              const createdAt = Date.now() - simulationStartRef.current;

              setTaskQueue((prev) => [...prev, {
                name: funcName,
                id: genId(),
                delay,
                createdAt
              }]);
            }
            if (node.body?.body) {
              node.body.body.forEach((stmt: any) => processSetTimeoutBody(stmt));
            }
          };

          // Find and process setTimeout calls in function d
          ast.body.forEach((stmt: any) => {
            if (stmt.type === "ExpressionStatement" &&
                stmt.expression?.type === "CallExpression" &&
                stmt.expression.callee?.name === "d") {
              const functionBody = functionMapRef.current["d"];
              if (functionBody) {
                functionBody.body.forEach((stmt: any) => processSetTimeoutBody(stmt));
              }
            }
          });
        }

        setTimeline((prev) => [
          ...prev,
          `Tick ${tickRef.current++}: Executed Task → ${job.name} (delay: ${job.delay}ms)`
        ]);

        // Remove from call stack after a short delay
        setTimeout(() => {
          setCallStack((prev) => prev.filter((ctx) => ctx.id !== job.id));
        }, 500);
      }
    }
  };

  const goNextStep = () => {
    debugger
    const nextIndex = stepIndexRef.current + 1;
    if (nextIndex >= stepsRef.current.length) return;
    const step = stepsRef.current[nextIndex];
    applyStep(step);
    stepIndexRef.current = nextIndex;
  };

  const goPrevStep = () => {
    resetAll();
    const newIndex = Math.max(0, stepIndexRef.current - 1);
    for (let i = 0; i <= newIndex; i++) {
      applyStep(stepsRef.current[i]);
    }
    stepIndexRef.current = newIndex;
  };

  useEffect(() => {
    resetAll();
  }, [code]);




  return (
    <div className="flex flex-row gap-6 p-6 max-w-[1400px] mx-auto relative bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 rounded-xl shadow-inner">
      {arrow && <AnimatedArrow from={arrow.from} to={arrow.to} />}
      <div className="flex flex-col w-1/3 space-y-6">
        <h2 className="font-bold text-xl text-gray-800">📝 Code Editor</h2>
        <Textarea
          rows={10}
          className="font-mono rounded-xl shadow-lg bg-white/80 backdrop-blur-sm border-2 border-pink-200/50 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-300/50 text-gray-800 placeholder-gray-500"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={goPrevStep} variant="secondary">
            Before Step
          </Button>
          <Button onClick={goNextStep} variant="secondary">
            Next Step
          </Button>
          <Button onClick={resetAll} variant="destructive">
            Reset
          </Button>
        </div>
      </div>
      <div className="flex flex-col w-2/3 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: "Call Stack", data: callStack, color: "bg-gray-100" },
            { label: "Microtask Queue", data: microtaskQueue, color: "bg-purple-100" },
            { label: "Task Queue", data: taskQueue, color: "bg-blue-100" },
          ].map((section) => (
            <div key={section.label}>
              <h3 className="font-semibold text-lg text-center mb-2 text-gray-700">
                {section.label}
              </h3>
              <div
                className={`border shadow-md rounded-xl p-4 min-h-[300px] flex flex-col-reverse items-center ${section.color} backdrop-blur-sm`}
              >
                <AnimatePresence>
                  {section.data.map((ctx) => (
                    <motion.div
                      key={ctx.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="w-40 mb-2"
                    >
                      <Card className="text-center shadow-md rounded-xl px-2 py-1 bg-white text-gray-700 border">
                        {ctx.name}
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {section.data.length === 0 && <div className="text-gray-400">Empty</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="border rounded-xl p-4 bg-white shadow-md mt-4 text-sm space-y-1 text-gray-700 max-h-60 overflow-auto">
          <h3 className="font-semibold mb-2">🕓 Event Loop Timeline</h3>
          {timeline.length === 0 ? (
            <div className="text-gray-400">No events yet</div>
          ) : (
            <ul className="list-disc list-inside">
              {timeline.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
