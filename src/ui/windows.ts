/** @param {NS} ns **/
export async function main(ns: NS) {
  // Create a container div
  const container = document.createElement('div');
  container.id = 'my-ui-container';
  container.style.position = 'fixed';
  container.style.top = '10px';
  container.style.right = '10px';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  container.style.color = 'white';
  container.style.padding = '10px';
  container.style.borderRadius = '5px';
  container.style.zIndex = '1000';

  // Create a title
  const title = document.createElement('h1');
  title.innerText = 'My BitBurner UI';
  title.style.fontSize = '16px';
  title.style.margin = '0 0 10px 0';
  container.appendChild(title);

  // Create close button
  const button = document.createElement('button');
  button.innerText = 'X';
  button.style.padding = '5px 10px';
  button.style.border = 'none';
  button.style.borderRadius = '3px';
  button.style.cursor = 'pointer';
  button.addEventListener('click', () => {
    container.remove();
    ns.exit();
  });
  container.appendChild(button);

  // Append the container to the body
  document.body.appendChild(container);

  // Keep the script running to keep the UI visible
  while (true) {
    await ns.sleep(1000);
  }
}