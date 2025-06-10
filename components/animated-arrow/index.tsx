import { motion } from "framer-motion";
import { createPortal } from "react-dom";

export default function AnimatedArrow({ from, to }: { from: string; to: string }) {
    return createPortal(
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: -10 }}
        exit={{ opacity: 0, y: 0 }}
        transition={{ duration: 0.5 }}
        className="absolute left-1/2 text-2xl text-green-600"
      >
        ➡
      </motion.div>,
      document.body
    );
  }
