import { Modal } from "antd";
import type { ReactNode } from "react";
import { SensitiveDataError } from "../core/claude";

/**
 * Runs something that sends text to Claude. If the text looks like it holds patient or customer
 * identifiers, David sees what was found and decides; nothing is sent unless he says so.
 * Returns null when he chooses not to send.
 */
export function useSensitiveGuard(): [<T>(send: (allowSensitive: boolean) => Promise<T>) => Promise<T | null>, ReactNode] {
  const [modal, holder] = Modal.useModal();

  async function guard<T>(send: (allowSensitive: boolean) => Promise<T>): Promise<T | null> {
    try {
      return await send(false);
    } catch (cause) {
      if (!(cause instanceof SensitiveDataError)) throw cause;
      const confirmed = await modal.confirm({
        title: "This may contain patient or customer details",
        width: 480,
        content: (
          <div className="sensitive-warning">
            <p>Before it goes to Claude, check these:</p>
            <ul>
              {cause.findings.map((finding, index) => (
                <li key={index}>
                  {finding.label}: <code>{finding.sample}</code>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Leave out customer and patient data until IT confirms Claude may receive it. Whatever is sent is kept in
              the Claude log under Settings.
            </p>
          </div>
        ),
        okText: "Send anyway",
        okButtonProps: { danger: true },
        cancelText: "Don't send",
      });
      return confirmed ? send(true) : null;
    }
  }

  return [guard, holder];
}
