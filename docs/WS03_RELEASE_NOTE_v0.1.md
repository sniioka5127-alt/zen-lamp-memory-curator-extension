# WS-03 Release Note v0.1

WS-03 integrates the public ZEN LAMP PROJECT global navigation into the One House Tools portal while keeping Tools-local navigation and Human Agency authority boundaries separate.

## Verified source state

- ZEN LAMP PROJECT global navigation is present and Tools is marked as the current destination.
- Existing ja / en / zh / ko controls continue to use the WS-02 local runtime.
- A second Tools-local navigation row links Overview, the four rooms, and Human Gate.
- Responsive behavior remains CSS-led; no new navigation JavaScript authority or provider/network transport is introduced.
- WS-02 production observation remains passing during WS-03 development.
- WS-03 production observation is expected to remain failing until the Human-controlled Hostinger upload adds the new `global-header.css` and updated `index.html`.

Status: **Implementation candidate** until separately adopted and production verification passes after deployment.
