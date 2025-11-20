import React from "react";

const EspressoMachinesIcon = ({ width = 30, height = 30, strokeWidth = 4, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}  // Increased stroke
    strokeLinecap="round"
    strokeLinejoin="round"
    width={width}
    height={height}
    {...props}
  >
    {/* Espresso Machines icon */}
    <rect x="5.33203" y="4.33228" width="53.3218" height="13.3304" rx="2.66609" fill="none" />
    <path d="M39.9902 17.6625C39.9902 22.0798 36.4092 25.6608 31.9919 25.6608C27.5746 25.6608 23.9937 22.0798 23.9937 17.6625" fill="none" />
    <rect width="38" height="34" transform="matrix(1 0 0 -1 12.9932 51.6627)" fill="none" />
    <rect width="48" height="34" transform="matrix(1 0 0 -1 7.99316 51.6627)" fill="none" />
    <rect x="5.33203" y="51.6558" width="53.3218" height="7.99827" rx="2.66609" fill="none" />
    <path d="M26.4448 37.6666H37.5565C37.702 37.6663 37.8461 37.6925 37.9807 37.7438C38.1152 37.7952 38.2376 37.8706 38.3407 37.9659C38.4439 38.0611 38.5258 38.1743 38.5818 38.2989C38.6379 38.4236 38.6669 38.5573 38.6673 38.6923V46.8971C38.6673 49.1638 36.6776 51 34.2232 51H29.7781C27.3237 51 25.334 49.1628 25.334 46.8971V38.6923C25.3344 38.5573 25.3634 38.4236 25.4195 38.2989C25.4755 38.1743 25.5574 38.0611 25.6606 37.9659C25.7637 37.8706 25.8861 37.7952 26.0206 37.7438C26.1552 37.6925 26.2993 37.6663 26.4448 37.6666Z" fill="none" />
    <path d="M38.667 40.3333H41.3337C42.8057 40.3333 44.0003 41.5275 44.0003 42.9995V45.667C44.0003 47.139 42.8057 48.3333 41.3337 48.3333H38.667" fill="none" />
    <path d="M18.6621 28.3269L25.3273 22.9948" fill="none" />
    <circle cx="31.9918" cy="10.9975" r="2.66609" fill="none" />
    <path d="M11.9985 8.33142H18.6638" fill="none" />
    <path d="M11.9985 13.6636H18.6638" fill="none" />
    <path d="M43.9902 8.3313H50.6555" fill="none" />
    <path d="M43.9902 13.6635H50.6555" fill="none" />
  </svg>
);

export default EspressoMachinesIcon;
